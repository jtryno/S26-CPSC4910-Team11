import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import ReviewsSection from '../../src/components/ReviewsSection';

global.fetch = vi.fn();

const driverUser = {user_id: 5, user_type: 'driver', username: 'test_driver'};
const sponsorUser = {user_id: 2, user_type: 'sponsor', username: 'test_sponsor'};
const adminUser = {user_id: 4, user_type: 'admin', username: 'test_admin'};

const makeReview = (overrides = {}) => ({
    review_id: 1,
    item_id: 10,
    driver_user_id: 5,
    driver_username: 'test_driver',
    rating: 4,
    review_text: 'Great product!',
    sponsor_reply: null,
    reply_username: null,
    reply_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
});

const mockFetchReviews = (reviews = [], avgRating = 4.0, totalReviews = 1) => {
    fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({reviews, avgRating, totalReviews}),
    });
};

describe('ReviewsSection — rating summary inline display', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows "No reviews yet" when totalReviews is 0', async () => {
        mockFetchReviews([], 0, 0);
        render(<ReviewsSection itemId={10} currentUser={driverUser} />);

        await waitFor(() => {
            expect(screen.getByText(/No reviews yet/i)).toBeInTheDocument();
        });
    });

    it('shows avg rating and count when reviews exist', async () => {
        mockFetchReviews([makeReview()], 4.0, 1);
        render(<ReviewsSection itemId={10} currentUser={driverUser} />);

        await waitFor(() => {
            expect(screen.getByText('4.0')).toBeInTheDocument();
            expect(screen.getByText('(1)')).toBeInTheDocument();
        });
    });

    it('opens the reviews panel when the rating summary is clicked', async () => {
        mockFetchReviews([makeReview()], 4.0, 1);
        //second fetch is for the panel loading reviews
        mockFetchReviews([makeReview()], 4.0, 1);

        render(<ReviewsSection itemId={10} currentUser={driverUser} />);

        await waitFor(() => expect(screen.getByText('4.0')).toBeInTheDocument());

        fireEvent.click(screen.getByTitle('View reviews'));

        await waitFor(() => {
            expect(screen.getByText('Reviews')).toBeInTheDocument();
        });
    });
});

describe('ReviewsPanel — loading and display', () => {
    beforeEach(() => vi.clearAllMocks());

    const openPanel = async (user, reviews = [makeReview()], avg = 4.0, total = 1) => {
        mockFetchReviews(reviews, avg, total);
        mockFetchReviews(reviews, avg, total);
        render(<ReviewsSection itemId={10} currentUser={user} />);
        await waitFor(() => expect(screen.getByTitle('View reviews')).toBeInTheDocument());
        fireEvent.click(screen.getByTitle('View reviews'));
        await waitFor(() => expect(screen.getByText('Reviews')).toBeInTheDocument());
    };

    it('shows loading indicator while fetching reviews', async () => {
        mockFetchReviews([], 0, 0);
        fetch.mockReturnValueOnce(new Promise(() => {})); //panel fetch never resolves
        render(<ReviewsSection itemId={10} currentUser={driverUser} />);
        await waitFor(() => fireEvent.click(screen.getByTitle('View reviews')));
        expect(screen.getByText(/Loading reviews/i)).toBeInTheDocument();
    });

    it('shows "No reviews yet" in panel when list is empty', async () => {
        await openPanel(driverUser, [], 0, 0);
        expect(screen.getAllByText(/No reviews yet/i).length).toBeGreaterThan(0);
    });

    it('renders review text and username', async () => {
        await openPanel(driverUser);
        expect(screen.getByText('Great product!')).toBeInTheDocument();
        expect(screen.getByText('test_driver')).toBeInTheDocument();
    });

    it('renders multiple reviews', async () => {
        const reviews = [
            makeReview({review_id: 1, review_text: 'First review'}),
            makeReview({review_id: 2, driver_user_id: 6, driver_username: 'other_driver', review_text: 'Second review'}),
        ];
        await openPanel(driverUser, reviews, 4.0, 2);
        expect(screen.getByText('First review')).toBeInTheDocument();
        expect(screen.getByText('Second review')).toBeInTheDocument();
    });

    it('shows sponsor reply when one exists', async () => {
        const review = makeReview({sponsor_reply: 'Thanks for your feedback!', reply_username: 'test_sponsor'});
        await openPanel(driverUser, [review]);
        expect(screen.getByText('Thanks for your feedback!')).toBeInTheDocument();
        expect(screen.getByText(/Sponsor Reply/i)).toBeInTheDocument();
    });

    it('closes the panel when × is clicked', async () => {
        await openPanel(driverUser);
        fireEvent.click(screen.getAllByRole('button', {name: '×'})[0]);
        await waitFor(() => {
            expect(screen.queryByText('Reviews')).not.toBeInTheDocument();
        });
    });
});

describe('ReviewsPanel — driver write review form', () => {
    beforeEach(() => vi.clearAllMocks());

    const openPanel = async () => {
        mockFetchReviews([], 0, 0);
        mockFetchReviews([], 0, 0);
        render(<ReviewsSection itemId={10} currentUser={driverUser} />);
        await waitFor(() => fireEvent.click(screen.getByTitle('View reviews')));
        await waitFor(() => expect(screen.getByText('Reviews')).toBeInTheDocument());
    };

    it('shows "+ Write a Review" button for drivers', async () => {
        await openPanel();
        expect(screen.getByRole('button', {name: /Write a Review/i})).toBeInTheDocument();
    });

    it('does not show write review button for sponsors', async () => {
        mockFetchReviews([], 0, 0);
        mockFetchReviews([], 0, 0);
        render(<ReviewsSection itemId={10} currentUser={sponsorUser} />);
        await waitFor(() => fireEvent.click(screen.getByTitle('View reviews')));
        await waitFor(() => expect(screen.getByText('Reviews')).toBeInTheDocument());
        expect(screen.queryByRole('button', {name: /Write a Review/i})).not.toBeInTheDocument();
    });

    it('opens the write review form when button is clicked', async () => {
        await openPanel();
        fireEvent.click(screen.getByRole('button', {name: /Write a Review/i}));
        expect(screen.getByText('Write a review')).toBeInTheDocument();
    });

    it('shows error when submitting without a rating', async () => {
        await openPanel();
        fireEvent.click(screen.getByRole('button', {name: /Write a Review/i}));
        fireEvent.click(screen.getByRole('button', {name: /Submit Review/i}));
        expect(screen.getByText(/Please select a rating/i)).toBeInTheDocument();
    });

    it('shows error when submitting without review text', async () => {
        await openPanel();
        fireEvent.click(screen.getByRole('button', {name: /Write a Review/i}));

        //means 4 star
        const stars = screen.getAllByText('★');
        fireEvent.click(stars[3]);

        fireEvent.click(screen.getByRole('button', {name: /Submit Review/i}));
        expect(screen.getByText(/Please write something/i)).toBeInTheDocument();
    });

    it('shows character count while typing', async () => {
        await openPanel();
        fireEvent.click(screen.getByRole('button', {name: /Write a Review/i}));

        fireEvent.change(screen.getByPlaceholderText(/Share your experience/i), {
            target: {value: 'Hello'},
        });

        expect(screen.getByText(/5 \/ 500 characters/i)).toBeInTheDocument();
    });

    it('disables submit button when over character limit', async () => {
        await openPanel();
        fireEvent.click(screen.getByRole('button', {name: /Write a Review/i}));

        fireEvent.change(screen.getByPlaceholderText(/Share your experience/i), {
            target: {value: 'a'.repeat(501)},
        });

        expect(screen.getByRole('button', {name: /Submit Review/i})).toBeDisabled();
    });

    it('submits review and calls fetch with correct payload', async () => {
        await openPanel();
        fireEvent.click(screen.getByRole('button', {name: /Write a Review/i}));

        const stars = screen.getAllByText('★');
        fireEvent.click(stars[3]); //this means 4 stars

        fireEvent.change(screen.getByPlaceholderText(/Share your experience/i), {
            target: {value: 'Really good item!'},
        });

        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({review: makeReview({review_text: 'Really good item!'})}),
        });
        mockFetchReviews([makeReview({review_text: 'Really good item!'})], 4.0, 1);

        fireEvent.click(screen.getByRole('button', {name: /Submit Review/i}));

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                '/api/catalog/reviews',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('Really good item!'),
                })
            );
        });
    });

    it('shows error message when submit fails', async () => {
        await openPanel();
        fireEvent.click(screen.getByRole('button', {name: /Write a Review/i}));

        const stars = screen.getAllByText('★');
        fireEvent.click(stars[3]);

        fireEvent.change(screen.getByPlaceholderText(/Share your experience/i), {
            target: {value: 'Good item'},
        });

        fetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({error: 'Already reviewed this item.'}),
        });

        fireEvent.click(screen.getByRole('button', {name: /Submit Review/i}));

        await waitFor(() => {
            expect(screen.getByText(/Already reviewed this item/i)).toBeInTheDocument();
        });
    });

    it('cancels the form when Cancel is clicked', async () => {
        await openPanel();
        fireEvent.click(screen.getByRole('button', {name: /Write a Review/i}));
        expect(screen.getByText('Write a review')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
        expect(screen.queryByText('Write a review')).not.toBeInTheDocument();
    });
});

describe('ReviewsPanel — existing review edit', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows "Edit My Review" instead of Write when driver already has a review', async () => {
        const myReview = makeReview({driver_user_id: driverUser.user_id});
        mockFetchReviews([myReview], 4.0, 1);
        mockFetchReviews([myReview], 4.0, 1);

        render(<ReviewsSection itemId={10} currentUser={driverUser} />);
        await waitFor(() => fireEvent.click(screen.getByTitle('View reviews')));
        await waitFor(() => expect(screen.getByText('Reviews')).toBeInTheDocument());

        expect(screen.getByRole('button', {name: /Edit My Review/i})).toBeInTheDocument();
    });

    it('pre-fills the form with existing review text when editing', async () => {
        const myReview = makeReview({driver_user_id: driverUser.user_id, review_text: 'Original text'});
        mockFetchReviews([myReview], 4.0, 1);
        mockFetchReviews([myReview], 4.0, 1);

        render(<ReviewsSection itemId={10} currentUser={driverUser} />);
        await waitFor(() => fireEvent.click(screen.getByTitle('View reviews')));
        await waitFor(() => expect(screen.getByText('Reviews')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', {name: /Edit My Review/i}));

        expect(screen.getByDisplayValue('Original text')).toBeInTheDocument();
        expect(screen.getByText('Edit your review')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Update Review/i})).toBeInTheDocument();
    });
});

describe('ReviewsPanel — delete review', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows delete button on own review', async () => {
        const myReview = makeReview({driver_user_id: driverUser.user_id});
        mockFetchReviews([myReview], 4.0, 1);
        mockFetchReviews([myReview], 4.0, 1);

        render(<ReviewsSection itemId={10} currentUser={driverUser} />);
        await waitFor(() => fireEvent.click(screen.getByTitle('View reviews')));
        await waitFor(() => expect(screen.getByText('Great product!')).toBeInTheDocument());

        //the × delete button should be on the review card
        const deleteButtons = screen.getAllByRole('button', {name: '×'});
        //one is the panel close, one is the review delete
        expect(deleteButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('does not show delete button on another driver\'s review', async () => {
        const otherReview = makeReview({driver_user_id: 999, driver_username: 'other'});
        mockFetchReviews([otherReview], 4.0, 1);
        mockFetchReviews([otherReview], 4.0, 1);

        render(<ReviewsSection itemId={10} currentUser={driverUser} />);
        await waitFor(() => fireEvent.click(screen.getByTitle('View reviews')));
        await waitFor(() => expect(screen.getByText('Great product!')).toBeInTheDocument());

        //only the panel close × should be present, not a review delete ×
        expect(screen.getAllByRole('button', {name: '×'})).toHaveLength(1);
    });
});

describe('ReviewsPanel — sponsor reply', () => {
    beforeEach(() => vi.clearAllMocks());

    const openPanelAsSponsor = async (reviews = [makeReview()]) => {
        mockFetchReviews(reviews, 4.0, 1);
        mockFetchReviews(reviews, 4.0, 1);
        render(<ReviewsSection itemId={10} currentUser={sponsorUser} />);
        await waitFor(() => fireEvent.click(screen.getByTitle('View reviews')));
        await waitFor(() => expect(screen.getByText('Great product!')).toBeInTheDocument());
    };

    it('shows "Reply as Sponsor" button for sponsors', async () => {
        await openPanelAsSponsor();
        expect(screen.getByRole('button', {name: /Reply as Sponsor/i})).toBeInTheDocument();
    });

    it('shows "Edit Reply" when a reply already exists', async () => {
        const review = makeReview({sponsor_reply: 'Thanks!', reply_username: 'test_sponsor'});
        await openPanelAsSponsor([review]);
        expect(screen.getByRole('button', {name: /Edit Reply/i})).toBeInTheDocument();
    });

    it('opens the reply textarea when Reply as Sponsor is clicked', async () => {
        await openPanelAsSponsor();
        fireEvent.click(screen.getByRole('button', {name: /Reply as Sponsor/i}));
        expect(screen.getByPlaceholderText(/Write a reply/i)).toBeInTheDocument();
    });

    it('shows reply button for admins too', async () => {
        mockFetchReviews([makeReview()], 4.0, 1);
        mockFetchReviews([makeReview()], 4.0, 1);
        render(<ReviewsSection itemId={10} currentUser={adminUser} />);
        await waitFor(() => fireEvent.click(screen.getByTitle('View reviews')));
        await waitFor(() => expect(screen.getByText('Great product!')).toBeInTheDocument());
        expect(screen.getByRole('button', {name: /Reply as Sponsor/i})).toBeInTheDocument();
    });

    it('submits reply and calls correct endpoint', async () => {
        await openPanelAsSponsor();
        fireEvent.click(screen.getByRole('button', {name: /Reply as Sponsor/i}));

        fireEvent.change(screen.getByPlaceholderText(/Write a reply/i), {
            target: {value: 'Thank you for your review!'},
        });

        fetch.mockResolvedValueOnce({ok: true, json: async () => ({})});
        mockFetchReviews([makeReview({sponsor_reply: 'Thank you for your review!'})], 4.0, 1);

        fireEvent.click(screen.getByRole('button', {name: /Post Reply/i}));

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                '/api/catalog/reviews/1/reply',
                expect.objectContaining({method: 'POST'})
            );
        });
    });

    it('disables Post Reply button when reply text is empty', async () => {
        await openPanelAsSponsor();
        fireEvent.click(screen.getByRole('button', {name: /Reply as Sponsor/i}));
        expect(screen.getByRole('button', {name: /Post Reply/i})).toBeDisabled();
    });

    it('cancels reply form when Cancel is clicked', async () => {
        await openPanelAsSponsor();
        fireEvent.click(screen.getByRole('button', {name: /Reply as Sponsor/i}));
        expect(screen.getByPlaceholderText(/Write a reply/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
        expect(screen.queryByPlaceholderText(/Write a reply/i)).not.toBeInTheDocument();
    });
});