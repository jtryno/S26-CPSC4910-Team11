import {useState, useEffect, useCallback} from 'react';

const CHAR_LIMIT = 500;

function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

const StarRow = ({value, onChange, size}) => {
    const [hovered, setHovered] = useState(0);
    const displaySize = size || 16;

    return (
        <div style={{display: 'flex', gap: '2px'}}>
            {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = (hovered || value) >= star;

                let starColor;
                if (isFilled) {
                    starColor = '#f59e0b';
                } else {
                    starColor = '#d1d5db';
                }

                let cursorStyle;
                if (onChange) {
                    cursorStyle = 'pointer';
                } else {
                    cursorStyle = 'default';
                }

                return (
                    <span
                        key={star}
                        onMouseEnter={() => {if(onChange) setHovered(star);}}
                        onMouseLeave={() => {if(onChange) setHovered(0);}}
                        onClick={() => {if(onChange) onChange(star);}}
                        style={{
                            fontSize: `${displaySize}px`,
                            color: starColor,
                            lineHeight: 1,
                            userSelect: 'none',
                            cursor: cursorStyle,
                        }}
                    >
                        ★
                    </span>
                );
            })}
        </div>
    );
};

const RatingSummary = ({avgRating, totalReviews}) => {
    if(totalReviews === 0) {
        return (
            <span style={{fontSize: '12px', color: '#888'}}>No reviews yet</span>
        );
    }

    return (
        <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
            <StarRow value={Math.round(avgRating)} size={13} />
            <span style={{fontSize: '12px', color: '#555', fontWeight: '600'}}>
                {avgRating.toFixed(1)}
            </span>
            <span style={{fontSize: '12px', color: '#888'}}>
                ({totalReviews})
            </span>
        </div>
    );
};

const ReviewCard = ({review, currentUser, onReplySubmit, onDelete}) => {
    const isSponsorOrAdmin = currentUser.user_type === 'sponsor' || currentUser.user_type === 'admin';
    const isOwner = currentUser.user_id === review.driver_user_id;

    const [replyOpen, setReplyOpen] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [saving, setSaving] = useState(false);
    const [replyError, setReplyError] = useState(null);

    const handleReplySave = async () => {
        if(!replyText) return;
        setSaving(true);
        setReplyError(null);
        try {
            await onReplySubmit(review.review_id, replyText);
            setReplyOpen(false);
            setReplyText('');
        } catch {
            setReplyError('Failed to save reply. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    let replyButtonLabel;
    if(review.sponsor_reply) {
        replyButtonLabel = 'Edit Reply';
    } else {
        replyButtonLabel = 'Reply as Sponsor';
    }

    let saveButtonLabel;
    if(saving) {
        saveButtonLabel = 'Saving...';
    } else {
        saveButtonLabel = 'Post Reply';
    }

    let saveButtonBg;
    if(saving || !replyText) {
        saveButtonBg = '#e0e0e0';
    } else {
        saveButtonBg = '#1565c0';
    }

    let saveButtonColor;
    if(saving || !replyText) {
        saveButtonColor = '#999';
    } else {
        saveButtonColor = '#fff';
    }

    let saveButtonCursor;
    if(saving || !replyText) {
        saveButtonCursor = 'not-allowed';
    } else {
        saveButtonCursor = 'pointer';
    }

    return (
        <div style={{
            padding: '12px 14px',
            borderRadius: '6px',
            border: '1px solid #e0e0e0',
            background: '#f9f9f9',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
        }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '3px'}}>
                    <span style={{fontWeight: '600', fontSize: '13px', color: '#1a1a1a'}}>
                        {review.driver_username}
                    </span>
                    <span style={{fontSize: '11px', color: '#aaa'}}>
                        {formatDate(review.created_at)}
                    </span>
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <StarRow value={review.rating} size={14} />
                    {isOwner && (
                        <button
                            onClick={() => onDelete(review.review_id)}
                            title="Delete your review"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#c62828',
                                cursor: 'pointer',
                                fontSize: '16px',
                                lineHeight: 1,
                                padding: '0 2px',
                            }}
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            <p style={{margin: 0, fontSize: '13px', color: '#333', lineHeight: '1.5'}}>
                {review.review_text}
            </p>

            {review.sponsor_reply && (
                <div style={{
                    marginTop: '4px',
                    padding: '8px 12px',
                    borderLeft: '3px solid #1565c0',
                    background: '#e3f2fd',
                    borderRadius: '0 4px 4px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                }}>
                    <div style={{fontSize: '11px', fontWeight: '700', color: '#1565c0', textTransform: 'uppercase', letterSpacing: '0.4px'}}>
                        Sponsor Reply
                        {review.reply_username && (
                            <span style={{fontWeight: '400', marginLeft: '6px', color: '#555', textTransform: 'none'}}>
                                — {review.reply_username}
                            </span>
                        )}
                    </div>
                    <p style={{margin: 0, fontSize: '13px', color: '#1a1a1a', lineHeight: '1.5'}}>
                        {review.sponsor_reply}
                    </p>
                </div>
            )}

            {isSponsorOrAdmin && !replyOpen && (
                <button
                    onClick={() => {
                        setReplyText(review.sponsor_reply || '');
                        setReplyOpen(true);
                    }}
                    style={{
                        alignSelf: 'flex-start',
                        fontSize: '12px',
                        padding: '3px 10px',
                        borderRadius: '4px',
                        border: '1px solid #1565c0',
                        background: '#fff',
                        color: '#1565c0',
                        cursor: 'pointer',
                        fontWeight: '600',
                        marginTop: '2px',
                    }}
                >
                    {replyButtonLabel}
                </button>
            )}

            {isSponsorOrAdmin && replyOpen && (
                <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px'}}>
                    <textarea
                        value={replyText}
                        onChange={(e) => {setReplyText(e.target.value); setReplyError(null);}}
                        placeholder="Write a reply visible to all drivers..."
                        rows={3}
                        style={{
                            resize: 'vertical',
                            padding: '8px',
                            fontSize: '13px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            fontFamily: 'inherit',
                            width: '100%',
                            boxSizing: 'border-box',
                        }}
                    />
                    {replyError && (
                        <span style={{fontSize: '12px', color: '#c62828'}}>{replyError}</span>
                    )}
                    <div style={{display: 'flex', gap: '8px'}}>
                        <button
                            onClick={handleReplySave}
                            disabled={saving || !replyText}
                            style={{
                                fontSize: '12px',
                                padding: '4px 14px',
                                borderRadius: '4px',
                                border: 'none',
                                background: saveButtonBg,
                                color: saveButtonColor,
                                cursor: saveButtonCursor,
                                fontWeight: '600',
                            }}
                        >
                            {saveButtonLabel}
                        </button>
                        <button
                            onClick={() => {setReplyOpen(false); setReplyText(''); setReplyError(null);}}
                            style={{
                                fontSize: '12px',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                border: '1px solid #e0e0e0',
                                background: '#f5f5f5',
                                color: '#333',
                                cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const WriteReviewForm = ({itemId, driverUserId, existingReview, onSaved, onCancel}) => {
    const [rating, setRating] = useState(existingReview ? existingReview.rating : 0);
    const [text, setText] = useState(existingReview ? existingReview.review_text : '');
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const charCount = text.length;
    const overLimit = charCount > CHAR_LIMIT;

    let charCountColor;
    if(overLimit) {
        charCountColor = '#c62828';
    } else if(charCount > CHAR_LIMIT * 0.85) {
        charCountColor = '#e65100';
    } else {
        charCountColor = '#888';
    }

    let borderColor;
    if(overLimit) {
        borderColor = '#c62828';
    } else {
        borderColor = '#ccc';
    }

    let submitButtonBg;
    if (saving || overLimit) {
        submitButtonBg = '#e0e0e0';
    } else {
        submitButtonBg = '#1976d2';
    }

    let submitButtonColor;
    if (saving || overLimit) {
        submitButtonColor = '#999';
    } else {
        submitButtonColor = '#fff';
    }

    let submitButtonCursor;
    if (saving || overLimit) {
        submitButtonCursor = 'not-allowed';
    } else {
        submitButtonCursor = 'pointer';
    }

    let submitButtonLabel;
    if (saving) {
        submitButtonLabel = 'Saving...';
    } else if (existingReview) {
        submitButtonLabel = 'Update Review';
    } else {
        submitButtonLabel = 'Submit Review';
    }

    let formTitle;
    if(existingReview) {
        formTitle = 'Edit your review';
    } else {
        formTitle = 'Write a review';
    }

    const handleSubmit = async () => {
        if(!rating) {setError('Please select a rating.'); return;}
        if(!text) {setError('Please write something before submitting.'); return;}
        if(overLimit) {setError(`Review must be ${CHAR_LIMIT} characters or fewer.`); return;}

        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/catalog/reviews', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({itemId, driverUserId, rating, reviewText: text}),
            });
            const json = await res.json();
            if (!res.ok) {
                setError(json.error || 'Failed to save review.');
                return;
            }
            onSaved(json.review);
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            padding: '12px 14px',
            border: '1px solid #c7d7f9',
            borderRadius: '6px',
            background: '#f0f4ff',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
        }}>
            <span style={{fontSize: '13px', fontWeight: '600', color: '#1a1a1a'}}>
                {formTitle}
            </span>

            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span style={{fontSize: '12px', color: '#555'}}>Rating:</span>
                <StarRow value={rating} onChange={setRating} size={20} />
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                <textarea
                    value={text}
                    onChange={(e) => {setText(e.target.value); setError(null);}}
                    placeholder={`Share your experience (up to ${CHAR_LIMIT} characters)...`}
                    rows={3}
                    style={{
                        width: '100%',
                        resize: 'vertical',
                        padding: '8px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: `1px solid ${borderColor}`,
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                    }}
                />
                <span style={{fontSize: '11px', color: charCountColor, alignSelf: 'flex-end'}}>
                    {charCount} / {CHAR_LIMIT} characters
                </span>
            </div>

            {error && (
                <span style={{fontSize: '12px', color: '#c62828'}}>{error}</span>
            )}

            <div style={{display: 'flex', gap: '8px'}}>
                <button
                    onClick={handleSubmit}
                    disabled={saving || overLimit}
                    style={{
                        fontSize: '13px',
                        padding: '6px 14px',
                        borderRadius: '4px',
                        border: 'none',
                        background: submitButtonBg,
                        color: submitButtonColor,
                        cursor: submitButtonCursor,
                        fontWeight: '600',
                    }}
                >
                    {submitButtonLabel}
                </button>
                <button
                    onClick={onCancel}
                    style={{
                        fontSize: '13px',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: '1px solid #e0e0e0',
                        background: '#f5f5f5',
                        color: '#333',
                        cursor: 'pointer',
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

const ReviewsPanel = ({itemId, currentUser, onClose}) => {
    const [reviews, setReviews] = useState([]);
    const [avgRating, setAvgRating] = useState(null);
    const [totalReviews, setTotalReviews] = useState(0);
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);

    const isDriver = currentUser.user_type === 'driver';

    const myReview = reviews.find(r => r.driver_user_id === currentUser.user_id) || null;

    const loadReviews = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/catalog/reviews/${itemId}`);
            if (res.ok) {
                const data = await res.json();
                setReviews(data.reviews || []);
                setAvgRating(data.avgRating);
                setTotalReviews(data.totalReviews);
            }
        } catch {}
        setLoading(false);
    }, [itemId]);

    useEffect(() => {
        loadReviews();
    }, [loadReviews]);

    const handleReviewSaved = () => {
        setFormOpen(false);
        loadReviews();
    };

    const handleReplySubmit = async (reviewId, replyText) => {
        const res = await fetch(`/api/catalog/reviews/${reviewId}/reply`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({sponsorUserId: currentUser.user_id, replyText}),
        });
        if(res.ok) {
            loadReviews();
        }
    };

    const handleDelete = async (reviewId) => {
        if(!window.confirm('Delete your review?')) return;
        const res = await fetch(`/api/catalog/reviews/${reviewId}`, {
            method: 'DELETE',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({driverUserId: currentUser.user_id}),
        });
        if(res.ok) {
            loadReviews();
        }
    };

    let writeReviewButtonLabel;
    if(myReview) {
        writeReviewButtonLabel = 'Edit My Review';
    } else {
        writeReviewButtonLabel = '+ Write a Review';
    }

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1100,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#ffffff',
                    borderRadius: '8px',
                    width: '520px',
                    maxWidth: '95vw',
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                }}
            >
                <div style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                }}>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                        <span style={{fontWeight: '600', fontSize: '16px', color: '#1a1a1a'}}>
                            Reviews
                        </span>
                        <RatingSummary avgRating={avgRating || 0} totalReviews={totalReviews} />
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '22px',
                            cursor: 'pointer',
                            color: '#666',
                            lineHeight: 1,
                            padding: '0 4px',
                        }}
                    >
                        ×
                    </button>
                </div>

                <div style={{flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px'}}>

                    {isDriver && !formOpen && (
                        <button
                            onClick={() => setFormOpen(true)}
                            style={{
                                alignSelf: 'flex-start',
                                fontSize: '13px',
                                padding: '6px 14px',
                                borderRadius: '4px',
                                border: '1px solid #1976d2',
                                background: '#fff',
                                color: '#1976d2',
                                cursor: 'pointer',
                                fontWeight: '600',
                            }}
                        >
                            {writeReviewButtonLabel}
                        </button>
                    )}

                    {isDriver && formOpen && (
                        <WriteReviewForm
                            itemId={itemId}
                            driverUserId={currentUser.user_id}
                            existingReview={myReview}
                            onSaved={handleReviewSaved}
                            onCancel={() => setFormOpen(false)}
                        />
                    )}

                    {loading && (
                        <p style={{color: '#888', fontSize: '13px', margin: 0}}>Loading reviews...</p>
                    )}

                    {!loading && reviews.length === 0 && (
                        <p style={{color: '#888', fontSize: '13px', margin: 0}}>
                            No reviews yet.
                        </p>
                    )}

                    {!loading && reviews.length > 0 && (
                        <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                            {reviews.map(review => (
                                <ReviewCard
                                    key={review.review_id}
                                    review={review}
                                    currentUser={currentUser}
                                    onReplySubmit={handleReplySubmit}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ReviewsSection = ({itemId, currentUser}) => {
    const [avgRating, setAvgRating] = useState(null);
    const [totalReviews, setTotalReviews] = useState(0);
    const [panelOpen, setPanelOpen] = useState(false);

    useEffect(() => {
        if(!itemId) return;
        fetch(`/api/catalog/reviews/${itemId}`)
            .then(res => {if (res.ok) return res.json();})
            .then(data => {
                if (!data) return;
                setAvgRating(data.avgRating);
                setTotalReviews(data.totalReviews);
            })
            .catch(() => {});
    }, [itemId]);

    return (
        <div>
            <div
                onClick={() => setPanelOpen(true)}
                style={{cursor: 'pointer', display: 'inline-block'}}
                title="View reviews"
            >
                <RatingSummary avgRating={avgRating || 0} totalReviews={totalReviews} />
            </div>

            {panelOpen && (
                <ReviewsPanel
                    itemId={itemId}
                    currentUser={currentUser}
                    onClose={() => setPanelOpen(false)}
                />
            )}
        </div>
    );
};

export default ReviewsSection;