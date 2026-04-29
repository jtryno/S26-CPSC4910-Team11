import { Buffer } from 'buffer';
import process from 'process';

const EBAY_SANDBOX_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_SANDBOX_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

// Module-level singleton token cache
let ebayAccessToken = null;
let ebayTokenExpiration = null;

export const ALLOWED_PROXY_HOSTS = [
    'i.ebayimg.com',
    'ir.ebaystatic.com',
    'thumbs.ebaystatic.com',
];

export async function getEbayAccessToken() {
    try {
        if (ebayAccessToken && ebayTokenExpiration && Date.now() < ebayTokenExpiration) {
            console.log('Using cached eBay access token');
            return ebayAccessToken;
        }

        console.log('Requesting new eBay access token...');

        const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');

        const response = await fetch(EBAY_SANDBOX_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`eBay token request failed: ${response.status} ${response.statusText}`, errorData);
            throw new Error(`Failed to get eBay access token: ${response.statusText}`);
        }

        const data = await response.json();
        ebayAccessToken = data.access_token;
        ebayTokenExpiration = Date.now() + ((data.expires_in - 300) * 1000);

        console.log('Successfully obtained eBay access token');
        return ebayAccessToken;
    } catch (err) {
        console.error('Error getting eBay access token:', err);
        throw err;
    }
}

export async function searchEbayCatalog(query = null, limit = 30) {
    try {
        const token = await getEbayAccessToken();

        const searchQueries = query
            ? [query]
            : ['women clothing', 'men clothing', 'shoes', 'jackets', 'accessories', 'dresses'];

        console.log(`Searching eBay for queries: ${searchQueries.join(', ')}`);

        let allProducts = [];

        for (const searchQuery of searchQueries) {
            try {
                const searchUrl = `${EBAY_SANDBOX_BROWSE_URL}?q=${encodeURIComponent(searchQuery)}&limit=${limit}&sort=relevance`;

                const response = await fetch(searchUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                    },
                });

                if (!response.ok) {
                    const errorData = await response.text();
                    console.error(`eBay browse request failed for "${searchQuery}": ${response.status} ${response.statusText}`, errorData);
                    continue;
                }

                const data = await response.json();
                console.log(`Found ${(data.itemSummaries || []).length} items for query: "${searchQuery}"`);

                const productsFromQuery = (data.itemSummaries || []).map((item, index) => {
                    const rawImageUrl = item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl;
                    const image = rawImageUrl
                        ? `/api/proxy-image?url=${encodeURIComponent(rawImageUrl)}`
                        : `https://via.placeholder.com/100?text=No+Image`;
                    return {
                        id: item.itemId || `${searchQuery}-${index}`,
                        title: item.title,
                        description: item.shortDescription || item.condition || 'No description available',
                        price: item.price?.value || '0.00',
                        image,
                        rawImageUrl: rawImageUrl || '',
                        itemWebUrl: item.itemWebUrl || '',
                        itemId: item.itemId,
                        category: item.categories?.[0]?.categoryName || null,
                    };
                });

                allProducts = allProducts.concat(productsFromQuery);
            } catch (err) {
                console.error(`Error searching for "${searchQuery}":`, err);
            }
        }

        console.log(`Total items found across all queries: ${allProducts.length}`);

        const uniqueProducts = [];
        const seenItemIds = new Set();

        for (const product of allProducts) {
            if (!seenItemIds.has(product.id)) {
                seenItemIds.add(product.id);
                uniqueProducts.push(product);
            }
        }

        for (let i = uniqueProducts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [uniqueProducts[i], uniqueProducts[j]] = [uniqueProducts[j], uniqueProducts[i]];
        }

        console.log(`Successfully fetched ${allProducts.length} products from eBay (${uniqueProducts.length} unique after deduplication).`);
        return uniqueProducts;
    } catch (err) {
        console.error('Error searching eBay catalog:', err);
        throw err;
    }
}
