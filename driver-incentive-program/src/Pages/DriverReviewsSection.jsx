import React, {useState, useEffect} from 'react';
import {fetchDriverReviews} from '../api/DriverReviewApi';

const StarDisplay = ({rating}) => (
    <span style={{fontSize: '16px', letterSpacing: '1px'}}>
        {[1, 2, 3, 4, 5].map((star) => {
            let starColor;
            if (star <= rating) {
                starColor = '#f59e0b';
            } else {
                starColor = '#d1d5db';
            }
            return (
                <span key={star} style={{color: starColor}}>★</span>
            );
        })}
    </span>
);

const DriverReviewsSection = ({driverUserId}) => {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!driverUserId) return;
        fetchDriverReviews(driverUserId)
            .then(setReviews)
            .finally(() => setLoading(false));
    }, [driverUserId]);

    let avgRating = null;
    if (reviews.length > 0) {
        avgRating = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
    }

    let reviewCountLabel;
    if (reviews.length === 1) {
        reviewCountLabel = '1 review';
    } else {
        reviewCountLabel = `${reviews.length} reviews`;
    }

    if (loading) return <div style={{color: '#888', fontSize: '14px'}}>Loading reviews...</div>;

    return (
        <div>
            <h2 style={{marginBottom: '12px'}}>Performance Reviews</h2>

            {reviews.length === 0 && (
                <div style={{
                    background: '#f9f9f9',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    padding: '24px',
                    color: '#888',
                    fontSize: '14px',
                    textAlign: 'center',
                }}>
                    No reviews yet.
                </div>
            )}

            {reviews.length > 0 && (
                <div>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '12px',
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '8px',
                        padding: '10px 20px',
                        marginBottom: '20px',
                    }}>
                        <span style={{fontSize: '28px', fontWeight: 'bold', color: '#92400e'}}>{avgRating}</span>
                        <div>
                            <StarDisplay rating={Math.round(Number(avgRating))} />
                            <div style={{fontSize: '12px', color: '#92400e', marginTop: '2px'}}>
                                {reviewCountLabel}
                            </div>
                        </div>
                    </div>

                    <div style={{display: 'grid', gap: '12px'}}>
                        {reviews.map((review) => {
                            const isEdited = review.updated_at !== review.created_at;
                            return (
                                <div key={review.review_id} style={{
                                    background: '#fff',
                                    border: '1px solid #e0e0e0',
                                    borderRadius: '8px',
                                    padding: '16px 20px',
                                }}>
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px'}}>
                                        <div>
                                            <div style={{fontWeight: '600', fontSize: '14px', color: '#1a1a1a'}}>
                                                {review.sponsor_username}
                                            </div>
                                            <div style={{fontSize: '12px', color: '#888', marginTop: '2px'}}>
                                                {review.sponsor_org_name && (
                                                    <span>{review.sponsor_org_name} · </span>
                                                )}
                                                {new Date(review.created_at).toLocaleDateString('en-US', {
                                                    month: 'short', day: 'numeric', year: 'numeric',
                                                })}
                                                {isEdited && (
                                                    <span style={{fontStyle: 'italic'}}> · edited</span>
                                                )}
                                            </div>
                                        </div>
                                        <StarDisplay rating={review.rating} />
                                    </div>
                                    {review.review_text && (
                                        <div style={{fontSize: '14px', color: '#444', lineHeight: '1.5'}}>
                                            {review.review_text}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DriverReviewsSection;