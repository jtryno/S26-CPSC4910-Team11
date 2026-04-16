import {render, screen, waitFor} from '@testing-library/react';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import DriverReviewsSection from '../../src/Pages/DriverReviewsSection';

vi.mock('../../src/api/DriverReviewApi', () => ({
    fetchDriverReviews: vi.fn(),
}));

import {fetchDriverReviews} from '../../src/api/DriverReviewApi';

const makeReview = (overrides = {}) => ({
    review_id: 1,
    driver_user_id: 10,
    sponsor_user_id: 2,
    rating: 4,
    review_text: 'stink driver',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    sponsor_username: 'sponsor1',
    sponsor_org_name: 'we be sponsors',
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('DriverReviewsSection loading state', () => {
    it('shows loading text while loading', () => {
        fetchDriverReviews.mockReturnValue(new Promise(() => {}));

        render(<DriverReviewsSection driverUserId={10} />);

        expect(screen.getByText(/Loading reviews/i)).toBeInTheDocument();
    });

    it('does not get reviews when driverUserId is not provided', () => {
        render(<DriverReviewsSection />);

        expect(fetchDriverReviews).not.toHaveBeenCalled();
    });
});


describe('DriverReviewsSection empty state', () => {
    it('shows "No reviews yet" when there are no reviews', async () => {
        fetchDriverReviews.mockResolvedValue([]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText(/No reviews yet/i)).toBeInTheDocument();
        });
    });
});


describe('reviews display', () => {
    it('renders the section heading', async () => {
        fetchDriverReviews.mockResolvedValue([makeReview()]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText('Performance Reviews')).toBeInTheDocument();
        });
    });

    it('shows review text for a single review', async () => {
        fetchDriverReviews.mockResolvedValue([makeReview({review_text: 'Excellent driving!'})]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText('Excellent driving!')).toBeInTheDocument();
        });
    });

    it('shows sponsor username for a review', async () => {
        fetchDriverReviews.mockResolvedValue([makeReview({sponsor_username: 'bob_sponsor'})]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText('bob_sponsor')).toBeInTheDocument();
        });
    });

    it('shows sponsor org name for a review', async () => {
        fetchDriverReviews.mockResolvedValue([makeReview({sponsor_org_name: 'doordash'})]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText(/doordash/i)).toBeInTheDocument();
        });
    });

    it('renders multiple reviews', async () => {
        fetchDriverReviews.mockResolvedValue([
            makeReview({review_id: 1, review_text: 'First review'}),
            makeReview({review_id: 2, review_text: 'Second review', sponsor_user_id: 3}),
        ]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText('First review')).toBeInTheDocument();
            expect(screen.getByText('Second review')).toBeInTheDocument();
        });
    });

    it('shows "edited" label when updated_at does not match created_at', async () => {
        fetchDriverReviews.mockResolvedValue([
            makeReview({
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-02-01T00:00:00Z',
            }),
        ]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText(/edited/i)).toBeInTheDocument();
        });
    });

    it('does not show the edited label when updated_at equals created_at', async () => {
        fetchDriverReviews.mockResolvedValue([
            makeReview({
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
            }),
        ]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => expect(screen.queryByText(/Loading reviews/i)).not.toBeInTheDocument());

        expect(screen.queryByText(/edited/i)).not.toBeInTheDocument();
    });
});


describe('DriverReviewsSection average rating', () => {
    it('shows the correct average rating for a single review', async () => {
        fetchDriverReviews.mockResolvedValue([makeReview({rating: 4})]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText('4.0')).toBeInTheDocument();
        });
    });

    it('shows the correct average rating across multiple reviews', async () => {
        fetchDriverReviews.mockResolvedValue([
            makeReview({review_id: 1, rating: 5}),
            makeReview({review_id: 2, rating: 3, sponsor_user_id: 3}),
        ]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText('4.0')).toBeInTheDocument();
        });
    });

    it('shows "1 review" label for a single review', async () => {
        fetchDriverReviews.mockResolvedValue([makeReview()]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText('1 review')).toBeInTheDocument();
        });
    });

    it('shows plural "reviews" label for multiple reviews', async () => {
        fetchDriverReviews.mockResolvedValue([
            makeReview({review_id: 1}),
            makeReview({review_id: 2, sponsor_user_id: 3}),
        ]);

        render(<DriverReviewsSection driverUserId={10} />);

        await waitFor(() => {
            expect(screen.getByText('2 reviews')).toBeInTheDocument();
        });
    });
});

describe('DriverReviewsSection API call', () => {
    it('fetches reviews with the correct driverUserId', async () => {
        fetchDriverReviews.mockResolvedValue([]);

        render(<DriverReviewsSection driverUserId={42} />);

        await waitFor(() => {
            expect(fetchDriverReviews).toHaveBeenCalledWith(42);
        });
    });

    it('fetches again when driverUserId changes', async () => {
        fetchDriverReviews.mockResolvedValue([]);

        const {rerender} = render(<DriverReviewsSection driverUserId={10} />);
        await waitFor(() => expect(fetchDriverReviews).toHaveBeenCalledWith(10));

        rerender(<DriverReviewsSection driverUserId={20} />);
        await waitFor(() => expect(fetchDriverReviews).toHaveBeenCalledWith(20));
    });
});