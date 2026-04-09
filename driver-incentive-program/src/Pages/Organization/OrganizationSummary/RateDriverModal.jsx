import React, {useState, useEffect} from 'react';
import Modal from '../../../components/Modal';
import {submitDriverReview, deleteDriverReview, fetchDriverReviews} from '../../../api/DriverReviewApi';

const StarRating = ({value, onChange, readonly = false}) => {
    const [hovered, setHovered] = useState(0);

    return (
        <div style={{display: 'flex', gap: '4px'}}>
            {[1, 2, 3, 4, 5].map((star) => {
                const filled = star <= (hovered || value);

                let starColor;
                if (filled) {
                    starColor = '#f5e50b';
                } else {
                    starColor = '#817e7e';
                }

                let starCursor;
                if (readonly) {
                    starCursor = 'default';
                } else {
                    starCursor = 'pointer';
                }

                return (
                    <span
                        key={star}
                        onClick={() => {if (!readonly) onChange(star);}}
                        onMouseEnter={() => {if (!readonly) setHovered(star);}}
                        onMouseLeave={() => {if (!readonly) setHovered(0);}}
                        style={{
                            fontSize: '28px',
                            cursor: starCursor,
                            color: starColor,
                            transition: 'color 0.1s',
                            userSelect: 'none',
                        }}
                    >
                        ★
                    </span>
                );
            })}
        </div>
    );
};

const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

const RateDriverModal = ({isOpen, onClose, driver, sponsorUserId, onReviewSaved}) => {
    const [rating, setRating] = useState(0);
    const [reviewText, setReviewText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState(null);
    const [existingReview, setExistingReview] = useState(null);
    const [loadingExisting, setLoadingExisting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!isOpen || !driver || !sponsorUserId) return;

        setRating(0);
        setReviewText('');
        setMsg(null);
        setExistingReview(null);
        setLoadingExisting(true);

        fetchDriverReviews(driver.user_id)
            .then((reviews) => {
                const mine = reviews.find(r => r.sponsor_user_id === sponsorUserId);
                if (mine) {
                    setExistingReview(mine);
                    setRating(mine.rating);
                    setReviewText(mine.review_text || '');
                }
            })
            .catch(() => {})
            .finally(() => setLoadingExisting(false));
    }, [isOpen, driver, sponsorUserId]);

    const handleSave = async () => {
        if (rating === 0) {
            setMsg({type: 'error', text: 'Please select a star rating.'});
            return;
        }
        if (reviewText.trim().length === 0) {
            setMsg({type: 'error', text: 'Please provide a reason for your rating.'});
            return;
        }
        setSubmitting(true);
        setMsg(null);
        try {
            await submitDriverReview(sponsorUserId, driver.user_id, rating, reviewText.trim());
            if (existingReview) {
                setMsg({type: 'success', text: 'Review updated.'});
            } else {
                setMsg({type: 'success', text: 'Review submitted.'});
            }
            if (onReviewSaved) onReviewSaved();
        } catch (err) {
            setMsg({type: 'error', text: err.message || 'Failed to save review.'});
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!existingReview) return;
        if (!window.confirm('Are you sure you want to delete your review for this driver?')) return;
        setDeleting(true);
        setMsg(null);
        try {
            await deleteDriverReview(existingReview.review_id, sponsorUserId);
            setExistingReview(null);
            setRating(0);
            setReviewText('');
            setMsg({type: 'success', text: 'Review deleted.'});
            if (onReviewSaved) onReviewSaved();
        } catch (err) {
            setMsg({type: 'error', text: err.message || 'Failed to delete review.'});
        } finally {
            setDeleting(false);
        }
    };

    const handleClose = () => {
        setRating(0);
        setReviewText('');
        setMsg(null);
        setExistingReview(null);
        onClose();
    };

    let saveLabel;
    if (submitting) {
        saveLabel = 'Saving...';
    } else if (existingReview) {
        saveLabel = 'Update Review';
    } else {
        saveLabel = 'Submit Review';
    }

    let deleteCursor;
    if (deleting) {
        deleteCursor = 'not-allowed';
    } else {
        deleteCursor = 'pointer';
    }

    let deleteLabel;
    if (deleting) {
        deleteLabel = 'Deleting...';
    } else {
        deleteLabel = 'Delete Review';
    }

    let msgBackground;
    let msgColor;
    if (msg) {
        if (msg.type === 'success') {
            msgBackground = '#e8f5e9';
            msgColor = '#2e7d32';
        } else {
            msgBackground = '#ffebee';
            msgColor = '#c62828';
        }
    }

    const driverUsername = driver?.username || 'Driver';

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            onSave={handleSave}
            title={`Rate ${driverUsername}`}
            saveLabel={saveLabel}
            saveDisabled={submitting || deleting || rating === 0 || !reviewText.trim()}
            maxWidth="480px"
        >
            {loadingExisting ? (
                <div style={{color: '#888', fontSize: '14px'}}>Loading...</div>
            ) : (
                <div style={{display: 'grid', gap: '16px'}}>
                    {existingReview && (
                        <div style={{
                            background: '#fff3e0',
                            border: '1px solid #eeff00',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '13px',
                            color: '#d68100',
                        }}>
                            You already reviewed this driver. Saving will update your existing review.
                        </div>
                    )}

                    <div>
                        <label style={{display: 'block', fontWeight: '600', fontSize: '13px', marginBottom: '8px', color: '#333'}}>
                            Rating <span style={{color: '#c62828'}}>*</span>
                        </label>
                        <StarRating value={rating} onChange={setRating} />
                        {rating > 0 && (
                            <div style={{fontSize: '12px', color: '#888', marginTop: '4px'}}>
                                {ratingLabels[rating]}
                            </div>
                        )}
                    </div>

                    <div>
                        <label style={{display: 'block', fontWeight: '600', fontSize: '13px', marginBottom: '6px', color: '#333'}}>
                            Reason / Comments <span style={{color: '#c62828'}}>*</span>
                        </label>
                        <textarea
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            placeholder="Describe your experience with this driver..."
                            rows={4}
                            maxLength={500}
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                fontSize: '14px',
                                resize: 'vertical',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit',
                            }}
                        />
                        <div style={{fontSize: '11px', color: '#aaa', textAlign: 'right'}}>
                            {reviewText.length}/500
                        </div>
                    </div>

                    {msg && (
                        <div style={{
                            padding: '8px 12px',
                            borderRadius: '4px',
                            background: msgBackground,
                            color: msgColor,
                            fontSize: '13px',
                        }}>
                            {msg.text}
                        </div>
                    )}

                    {existingReview && msg?.type !== 'success' && (
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            style={{
                                padding: '6px 16px',
                                borderRadius: '4px',
                                border: '1px solid #c62828',
                                background: '#fff',
                                color: '#c62828',
                                cursor: deleteCursor,
                                fontSize: '13px',
                                fontWeight: '600',
                                alignSelf: 'flex-start',
                            }}
                        >
                            {deleteLabel}
                        </button>
                    )}
                </div>
            )}
        </Modal>
    );
};

export default RateDriverModal;