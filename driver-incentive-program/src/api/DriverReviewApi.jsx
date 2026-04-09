//get all reviews for a specific driver
async function fetchDriverReviews(driverUserId) {
    try {
        const response = await fetch(`/api/dashboard/reviews/${driverUserId}`);
        const data = await response.json();
        return data.reviews || [];
    } catch (error) {
        console.error('Error fetching driver reviews:', error);
        return [];
    }
}

//post: sponsor submits or updates a review for a driver
async function submitDriverReview(sponsorUserId, driverUserId, rating, reviewText) {
    try {
        const response = await fetch('/api/driver-reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sponsorUserId, driverUserId, rating, reviewText }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to submit review');
        return data;
    } catch (error) {
        console.error('Error submitting driver review:', error);
        throw error;
    }
}

//delete: sponsor removes their review
async function deleteDriverReview(reviewId, sponsorUserId) {
    try {
        const response = await fetch(`/api/dashboard/reviews/${reviewId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sponsorUserId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to delete review');
        return data;
    } catch (error) {
        console.error('Error deleting driver review:', error);
        throw error;
    }
}

export { fetchDriverReviews, submitDriverReview, deleteDriverReview };