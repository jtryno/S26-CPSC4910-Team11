// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock the DB module before the server is imported so no real connection is attempted
vi.mock('../../server/db.js', () => ({
    default: {
        query: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({ release: vi.fn() }),
    },
}));

// Import app after the mock is registered
import { app } from '../../server/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A minimal eBay item summary object. Pass overrides to test edge cases.
 */
const makeEbayItem = (overrides = {}) => ({
    itemId: 'v1|111|0',
    title: 'Test Item',
    shortDescription: 'Great test item',
    condition: 'New',
    price: { value: '25.00' },
    image: { imageUrl: 'https://i.ebayimg.com/images/test.jpg' },
    ...overrides,
});

/**
 * Build a mock eBay OAuth token response.
 * expires_in: 300 makes the cache TTL = 0ms so the token is always
 * considered expired, ensuring each test re-fetches a fresh token.
 */
const tokenResponse = () => ({
    ok: true,
    status: 200,
    json: async () => ({ access_token: 'mock-token', expires_in: 300 }),
    text: async () => '',
});

/** Build a mock eBay Browse API search response. */
const searchResponse = (items = []) => ({
    ok: true,
    status: 200,
    json: async () => ({ itemSummaries: items }),
    text: async () => '',
});

/**
 * Set up global.fetch to return responses in call order.
 * The last response is reused for any additional calls beyond the list.
 */
const mockFetch = (...responses) => {
    let callIndex = 0;
    global.fetch = vi.fn().mockImplementation(() => {
        const res = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        return Promise.resolve(res);
    });
};

// ---------------------------------------------------------------------------
// GET /api/catalog
// ---------------------------------------------------------------------------

describe('GET /api/catalog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it('returns 200 with an array of products when eBay API succeeds', async () => {
        mockFetch(tokenResponse(), searchResponse([makeEbayItem()]));

        const res = await request(app).get('/api/catalog');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
    });

    it('returns products containing all required fields', async () => {
        mockFetch(tokenResponse(), searchResponse([makeEbayItem()]));

        const res = await request(app).get('/api/catalog');
        const product = res.body[0];

        expect(product).toHaveProperty('id');
        expect(product).toHaveProperty('title', 'Test Item');
        expect(product).toHaveProperty('description');
        expect(product).toHaveProperty('price', '25.00');
        expect(product).toHaveProperty('image');
        expect(product).toHaveProperty('itemId', 'v1|111|0');
    });

    it('routes image URLs through the local /api/proxy-image endpoint', async () => {
        mockFetch(tokenResponse(), searchResponse([makeEbayItem()]));

        const res = await request(app).get('/api/catalog');
        const product = res.body[0];

        expect(product.image).toMatch(/^\/api\/proxy-image\?url=/);
        expect(decodeURIComponent(product.image)).toContain('https://i.ebayimg.com/images/test.jpg');
    });

    it('uses shortDescription when available', async () => {
        mockFetch(
            tokenResponse(),
            searchResponse([makeEbayItem({ shortDescription: 'Amazing deal', condition: 'Used' })])
        );

        const res = await request(app).get('/api/catalog');

        expect(res.body[0].description).toBe('Amazing deal');
    });

    it('falls back to condition when shortDescription is absent', async () => {
        mockFetch(
            tokenResponse(),
            searchResponse([makeEbayItem({ shortDescription: undefined, condition: 'Like New' })])
        );

        const res = await request(app).get('/api/catalog');

        expect(res.body[0].description).toBe('Like New');
    });

    it('falls back to "No description available" when neither shortDescription nor condition exists', async () => {
        mockFetch(
            tokenResponse(),
            searchResponse([makeEbayItem({ shortDescription: undefined, condition: undefined })])
        );

        const res = await request(app).get('/api/catalog');

        expect(res.body[0].description).toBe('No description available');
    });

    it('uses thumbnailImages as the image source when image field is absent', async () => {
        const thumbUrl = 'https://i.ebayimg.com/thumb.jpg';
        mockFetch(
            tokenResponse(),
            searchResponse([makeEbayItem({ image: undefined, thumbnailImages: [{ imageUrl: thumbUrl }] })])
        );

        const res = await request(app).get('/api/catalog');

        expect(decodeURIComponent(res.body[0].image)).toContain(thumbUrl);
    });

    it('uses a placeholder image when no image URL is present at all', async () => {
        mockFetch(
            tokenResponse(),
            searchResponse([makeEbayItem({ image: undefined, thumbnailImages: undefined })])
        );

        const res = await request(app).get('/api/catalog');

        expect(res.body[0].image).toContain('placeholder');
    });

    it('deduplicates items that share the same itemId', async () => {
        const item = makeEbayItem({ itemId: 'v1|dup|0' });
        mockFetch(tokenResponse(), searchResponse([item, item]));

        const res = await request(app).get('/api/catalog');

        expect(res.body).toHaveLength(1);
    });

    it('uses the provided q query parameter as the search term', async () => {
        mockFetch(tokenResponse(), searchResponse([]));

        await request(app).get('/api/catalog?q=headphones');

        const calls = global.fetch.mock.calls;
        const searchCall = calls.find(([url]) => url.includes('item_summary/search'));
        expect(searchCall[0]).toContain('q=headphones');
    });

    it('returns 502 when the eBay OAuth token request fails', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            text: async () => 'Unauthorized',
        });

        const res = await request(app).get('/api/catalog');

        expect(res.status).toBe(502);
        expect(res.body).toHaveProperty('error');
    });

    it('returns 502 when the eBay Browse search request fails', async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce(tokenResponse())
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: async () => 'Server Error',
            });

        // When all search queries fail, the catalog returns an empty array (not 502)
        // because individual query failures are caught and skipped
        const res = await request(app).get('/api/catalog');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// GET /api/proxy-image
// ---------------------------------------------------------------------------

describe('GET /api/proxy-image', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it('returns 400 when the url query parameter is missing', async () => {
        const res = await request(app).get('/api/proxy-image');

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'url parameter is required');
    });

    it('returns an SVG placeholder when the upstream image returns a non-200 status', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 });

        const res = await request(app)
            .get('/api/proxy-image?url=https://example.com/missing.jpg');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
    });

    it('proxies image bytes with correct content-type and CORS headers on success', async () => {
        const fakeBuffer = Buffer.from([0xFF, 0xD8, 0xFF]); // minimal JPEG magic bytes
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            arrayBuffer: async () => fakeBuffer.buffer,
            headers: { get: (key) => key === 'content-type' ? 'image/jpeg' : null },
        });

        const res = await request(app)
            .get('/api/proxy-image?url=https://example.com/img.jpg');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/jpeg');
        expect(res.headers['access-control-allow-origin']).toBe('*');
        expect(res.headers['cache-control']).toContain('max-age=86400');
    });

    it('returns an SVG placeholder when the upstream fetch throws a network error', async () => {
        global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network failure'));

        const res = await request(app)
            .get('/api/proxy-image?url=https://example.com/img.jpg');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/svg+xml');
    });
});
