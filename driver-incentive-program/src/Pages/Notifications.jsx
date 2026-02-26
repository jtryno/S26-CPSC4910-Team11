import React, { useState, useEffect } from 'react';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, fetchNotificationPreferences, updateNotificationPreferences } from '../api/NotificationApi';

const notificationTypes = {
    dropped: {label: 'Removed from Org', color: '#c62828'},
    points_changed: {label: 'Points Changed', color: '#1565c0'},
    order_placed: {label: 'Order Placed', color: '#2e7d32'},
    password_changed: {label: 'Password Changed', color: '#e65100'},
    application_status: {label: 'Application', color: '#6a1b9a'},
};

function formatDate(dateStr) {
    if(!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true});
}

const NotificationCard = ({ notification, onRead }) => {
    const nType = notificationTypes[notification.category] || { label: notification.category, color: '#666' };
    const isUnread = !notification.read_at;

    let cardBorder;
    if(isUnread) {
        cardBorder = '1px solid #7db2f8';
    } else {
        cardBorder = '1px solid #e0e0e0';
    }

    let cardBackground;
    if(isUnread) {
        cardBackground = '#f0f7ff';
    } else {
        cardBackground = '#f9f9f9';
    }

    let cardCursor;
    if(isUnread) {
        cardCursor = 'pointer';
    } else {
        cardCursor = 'default';
    }

    let dotBackground;
    if(isUnread) {
        dotBackground = '#1565c0';
    } else {
        dotBackground = '#f9f9f9';
    }

    const handleClick = () => {
        if(isUnread) {
            onRead(notification.notification_id);
        }
    };

    return (
        <div
            onClick={handleClick}
            style={{
                display: 'flex',
                gap: '14px',
                padding: '16px',
                marginBottom: '10px',
                borderRadius: '8px',
                border: cardBorder,
                background: cardBackground,
                cursor: cardCursor,
            }}
        >
            <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: dotBackground,
                marginTop: '6px', flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
                <span style={{
                    display: 'inline-block',
                    background: nType.color,
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: '600',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    marginBottom: '6px',
                }}>
                    {nType.label}
                </span>
                <div style={{ fontSize: '14px', color: '#1a1a1a', lineHeight: '1.5', marginBottom: '6px' }}>
                    {notification.message}
                </div>
                <div style={{ fontSize: '12px', color: '#888' }}>
                    {formatDate(notification.created_at)}
                    {notification.read_at && (
                        <span style={{ marginLeft: '10px', color: '#bbb' }}>
                            · Read {formatDate(notification.read_at)}
                        </span>
                    )}
                </div>
            </div>
            {isUnread && (
                <div style={{ fontSize: '12px', color: '#1565c0', alignSelf: 'center', flexShrink: 0 }}>
                    Mark read
                </div>
            )}
        </div>
    );
};

const PreferenceRow = ({ label, enabled, mandatory, onToggle }) => {
    let buttonBorder;
    if(enabled) {
        buttonBorder = '1px solid #2e7d32';
    } else {
        buttonBorder = '1px solid #e0e0e0';
    }

    let buttonBackground;
    if(enabled) {
        buttonBackground = '#e8f5e9';
    } else {
        buttonBackground = '#f9f9f9';
    }

    let buttonColor;
    if(enabled) {
        buttonColor = '#2e7d32';
    } else {
        buttonColor = '#888';
    }

    let buttonLabel;
    if(enabled) {
        buttonLabel = 'Enabled';
    } else {
        buttonLabel = 'Disabled';
    }

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 0', borderBottom: '1px solid #e0e0e0',
        }}>
            <div style={{ fontSize: '14px', color: '#1a1a1a' }}>
                {label}
                {mandatory && (
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#c62828', fontWeight: '600' }}>
                        Required
                    </span>
                )}
            </div>
            {mandatory && <span style={{ color: '#2e7d32', fontWeight: '600', fontSize: '13px' }}>Always On</span>}
            {!mandatory && (
                <button
                    onClick={onToggle}
                    style={{
                        padding: '5px 16px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: buttonBorder,
                        cursor: 'pointer',
                        fontWeight: '600',
                        background: buttonBackground,
                        color: buttonColor,
                    }}
                >
                    {buttonLabel}
                </button>
            )}
        </div>
    );
};

const Notifications = () => {
    const userData = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');
    const userId = userData?.user_id;
    const isDriver = userData?.user_type === 'driver';

    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [prefs, setPrefs] = useState({points_changed_enabled: 1, order_placed_enabled: 1});
    const [activeTab, setActiveTab] = useState('all');

    useEffect(() => {
        if (!userId) return;
        const load = async () => {
            let preferencesPromise;
            if(isDriver) {
                preferencesPromise = fetchNotificationPreferences(userId);
            } else {
                preferencesPromise = Promise.resolve(null);
            }
            const [notifs, preferences] = await Promise.all([
                fetchNotifications(userId),
                preferencesPromise,
            ]);
            setNotifications(notifs);
            if(preferences) {
                setPrefs(preferences);
            }
            setLoading(false);
        };
        load();
    }, [userId]);

    const handleMarkRead = async (notificationId) => {
        await markNotificationRead(notificationId);
        setNotifications(prev =>
            prev.map(n => {
                if(n.notification_id === notificationId) {
                    return {...n, read_at: new Date().toISOString()};
                }
                return n;
            })
        );
    };

    const handleMarkAllRead = async () => {
        await markAllNotificationsRead(userId);
        const now = new Date().toISOString();
        setNotifications(prev => prev.map(n => {
            if(n.read_at) {
                return n;
            }
            return {...n, read_at: now};
        }));
    };

    const handleTogglePref = async (key) => {
        let newVal;
        if(prefs[key] === 1) {
            newVal = 0;
        } else {
            newVal = 1;
        }
        const newPrefs = {...prefs, [key]: newVal};
        setPrefs(newPrefs);
        await updateNotificationPreferences(userId, newPrefs);
    };

    const handleToggleAll = async () => {
        const anyEnabled = prefs.points_changed_enabled === 1 || prefs.order_placed_enabled === 1;
        let newVal;
        if(anyEnabled) {
            newVal = 0;
        } else {
            newVal = 1;
        }
        const newPrefs = {points_changed_enabled: newVal, order_placed_enabled: newVal};
        setPrefs(newPrefs);
        await updateNotificationPreferences(userId, newPrefs);
    };

    const unreadCount = notifications.filter(n => !n.read_at).length;

    let displayed;
    if(activeTab === 'unread') {
        displayed = notifications.filter(n => !n.read_at);
    } else {
        displayed = notifications;
    }

    const allDisabled = prefs.points_changed_enabled === 0 && prefs.order_placed_enabled === 0;

    let unreadText;
    if(unreadCount > 0) {
        unreadText = `${unreadCount} unread`;
    } else {
        unreadText = 'Caught Up';
    }

    let toggleAllLabel;
    if(allDisabled) {
        toggleAllLabel = 'Enable All';
    } else {
        toggleAllLabel = 'Disable All';
    }

    let emptyMessage;
    if(activeTab === 'unread') {
        emptyMessage = 'No unread notifications.';
    } else {
        emptyMessage = 'No notifications yet.';
    }

    if (!userData) return <div style={{padding: '40px'}}>Please log in.</div>;
    if (loading) return <div style={{padding: '40px', color: '#888'}}>Loading notifications...</div>;

    return (
        <div style={{maxWidth: '800px', margin: '0 auto'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                <div>
                    <h1 style={{margin: '0 0 4px 0', color: '#1a1a1a'}}>Notifications</h1>
                    <div style={{fontSize: '13px', color: '#888'}}>
                        {unreadText}
                    </div>
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={handleMarkAllRead}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '4px',
                            border: '1px solid #e0e0e0',
                            background: '#f9f9f9',
                            color: '#1a1a1a',
                            cursor: 'pointer',
                            fontSize: '13px',
                        }}
                    >
                        Mark all read
                    </button>
                )}
            </div>

            <div style={{display: 'flex', borderBottom: '2px solid #f9f9f9', marginBottom: '20px'}}>
                {['all', 'unread'].map(tab => {
                    let tabBorderBottom;
                    if(activeTab === tab) {
                        tabBorderBottom = '2px solid #1565c0';
                    } else {
                        tabBorderBottom = '2px solid transparent';
                    }

                    let tabFontWeight;
                    if(activeTab === tab) {
                        tabFontWeight = '600';
                    } else {
                        tabFontWeight = '400';
                    }

                    let tabColor;
                    if(activeTab === tab) {
                        tabColor = '#1565c0';
                    } else {
                        tabColor = '#666';
                    }

                    let tabLabel;
                    if(tab === 'unread' && unreadCount > 0) {
                        tabLabel = `${tab} (${unreadCount})`;
                    } else {
                        tabLabel = tab;
                    }

                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '8px 20px',
                                border: 'none',
                                borderBottom: tabBorderBottom,
                                marginBottom: '-2px',
                                background: 'none',
                                cursor: 'pointer',
                                fontWeight: tabFontWeight,
                                color: tabColor,
                                fontSize: '14px',
                                textTransform: 'capitalize',
                            }}
                        >
                            {tabLabel}
                        </button>
                    );
                })}
            </div>

            <div style={{marginBottom: '40px'}}>
                {displayed.length === 0 && (
                    <div style={{textAlign: 'center', padding: '60px 0', color: '#888', fontSize: '14px'}}>
                        {emptyMessage}
                    </div>
                )}
                {displayed.length > 0 && (
                    displayed.map(n => (
                        <NotificationCard key={n.notification_id} notification={n} onRead={handleMarkRead} />
                    ))
                )}
            </div>

            {isDriver && (
                <div style={{background: '#f9f9f9', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '20px 24px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                        <h2 style={{margin: 0, fontSize: '16px', color: '#1a1a1a'}}>Notification Preferences</h2>
                        <button
                            onClick={handleToggleAll}
                            style={{
                                padding: '5px 14px',
                                fontSize: '13px',
                                borderRadius: '4px',
                                border: '1px solid #e0e0e0',
                                background: '#f9f9f9',
                                cursor: 'pointer',
                                color: '#1a1a1a',
                            }}
                        >
                            {toggleAllLabel}
                        </button>
                    </div>
                    <PreferenceRow label="Removed from organization" enabled={true} mandatory={true} />
                    <PreferenceRow label="Password changedd" enabled={true} mandatory={true} />
                    <PreferenceRow
                        label="Points added or removed"
                        enabled={prefs.points_changed_enabled === 1}
                        mandatory={false}
                        onToggle={() => handleTogglePref('points_changed_enabled')}
                    />
                    <PreferenceRow
                        label="Order placed"
                        enabled={prefs.order_placed_enabled === 1}
                        mandatory={false}
                        onToggle={() => handleTogglePref('order_placed_enabled')}
                    />
                </div>
            )}
        </div>
    );
};

export default Notifications;