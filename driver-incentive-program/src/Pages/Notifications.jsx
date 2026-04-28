import React, { useState, useEffect } from 'react';
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  fetchNotificationPreferences, updateNotificationPreferences,
} from '../api/NotificationApi';
import { PageHeader, Button, Badge, Tabs, EmptyState, Card } from '../components/ui';

const NOTIFICATION_TYPES = {
  dropped:             { label: 'Removed from Org', tone: 'danger' },
  points_changed:      { label: 'Points Changed',   tone: 'info' },
  order_placed:        { label: 'Order Placed',     tone: 'success' },
  password_changed:    { label: 'Password Changed', tone: 'warning' },
  application_status:  { label: 'Application',      tone: 'neutral' },
  ticket_updated:      { label: 'Support Ticket',   tone: 'info' },
  catalog_item_removed:{ label: 'Catalog Update',   tone: 'warning' },
  price_drop:          { label: 'Price Drop',        tone: 'success' },
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

const NotificationCard = ({ notification, onRead }) => {
  const nType = NOTIFICATION_TYPES[notification.category] || { label: notification.category, tone: 'neutral' };
  const isUnread = !notification.read_at;

  return (
    <div
      onClick={() => isUnread && onRead(notification.notification_id)}
      style={{
        display: 'flex',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
        marginBottom: 'var(--space-2)',
        borderRadius: 'var(--radius-lg)',
        border: isUnread ? '1px solid var(--color-info-border)' : '1px solid var(--color-border-light)',
        background: isUnread ? 'var(--color-info-light)' : 'var(--color-surface)',
        cursor: isUnread ? 'pointer' : 'default',
        transition: 'background var(--transition-base)',
      }}
    >
      <div style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 7,
        background: isUnread ? 'var(--color-primary)' : 'var(--color-border)',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <Badge tone={nType.tone}>{nType.label}</Badge>
        </div>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', margin: '0 0 var(--space-1)', lineHeight: 'var(--line-height-relaxed)' }}>
          {notification.message}
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-faint)', margin: 0 }}>
          {formatDate(notification.created_at)}
          {notification.read_at && (
            <span style={{ marginLeft: 'var(--space-3)' }}>
              · Read {formatDate(notification.read_at)}
            </span>
          )}
        </p>
      </div>
      {isUnread && (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 'var(--font-weight-medium)', flexShrink: 0, alignSelf: 'center' }}>
          Mark read
        </span>
      )}
    </div>
  );
};

const PreferenceRow = ({ label, enabled, mandatory, onToggle }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-3) 0',
    borderBottom: '1px solid var(--color-border-light)',
  }}>
    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text)' }}>
      {label}
      {mandatory && (
        <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', fontWeight: 'var(--font-weight-semibold)' }}>
          Required
        </span>
      )}
    </div>
    {mandatory
      ? <span style={{ color: 'var(--color-success)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>Always On</span>
      : (
        <Button
          variant={enabled ? 'success' : 'secondary'}
          size="sm"
          onClick={onToggle}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </Button>
      )}
  </div>
);

const Notifications = () => {
  const userData = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');
  const userId = userData?.user_id;
  const isDriver = userData?.user_type === 'driver';

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState({ points_changed_enabled: 1, order_placed_enabled: 1 });
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const [notifs, preferences] = await Promise.all([
        fetchNotifications(userId),
        isDriver ? fetchNotificationPreferences(userId) : Promise.resolve(null),
      ]);
      setNotifications(notifs);
      if (preferences) setPrefs(preferences);
      setLoading(false);
    };
    load();
  }, [userId]);

  const handleMarkRead = async (notificationId) => {
    await markNotificationRead(notificationId);
    setNotifications(prev =>
      prev.map(n => n.notification_id === notificationId
        ? { ...n, read_at: new Date().toISOString() }
        : n)
    );
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(userId);
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }));
  };

  const handleTogglePref = async (key) => {
    const newPrefs = { ...prefs, [key]: prefs[key] === 1 ? 0 : 1 };
    setPrefs(newPrefs);
    await updateNotificationPreferences(userId, newPrefs);
  };

  const handleToggleAll = async () => {
    const anyEnabled = prefs.points_changed_enabled === 1 || prefs.order_placed_enabled === 1;
    const newVal = anyEnabled ? 0 : 1;
    const newPrefs = { points_changed_enabled: newVal, order_placed_enabled: newVal };
    setPrefs(newPrefs);
    await updateNotificationPreferences(userId, newPrefs);
  };

  if (!userData) return <div style={{ padding: 'var(--space-10)' }}>Please log in.</div>;
  if (loading)   return <div style={{ padding: 'var(--space-10)', color: 'var(--color-text-muted)' }}>Loading…</div>;

  const unreadCount = notifications.filter(n => !n.read_at).length;
  const allDisabled = prefs.points_changed_enabled === 0 && prefs.order_placed_enabled === 0;

  const tabs = [
    {
      label: 'All',
      content: (
        <NotificationList
          items={notifications}
          emptyMessage="No notifications yet."
          onRead={handleMarkRead}
        />
      ),
    },
    {
      label: unreadCount > 0 ? `Unread (${unreadCount})` : 'Unread',
      content: (
        <NotificationList
          items={notifications.filter(n => !n.read_at)}
          emptyMessage="No unread notifications."
          onRead={handleMarkRead}
        />
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        actions={
          unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )
        }
      />

      <Tabs tabs={tabs} activeIndex={tabIndex} onChange={setTabIndex} />

      {isDriver && (
        <Card style={{ marginTop: 'var(--space-8)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)' }}>Notification Preferences</h3>
            <Button variant="secondary" size="sm" onClick={handleToggleAll}>
              {allDisabled ? 'Enable All' : 'Disable All'}
            </Button>
          </div>
          <PreferenceRow label="Removed from organization" enabled mandatory />
          <PreferenceRow label="Password changed" enabled mandatory />
          <PreferenceRow
            label="Points added or removed"
            enabled={prefs.points_changed_enabled === 1}
            onToggle={() => handleTogglePref('points_changed_enabled')}
          />
          <PreferenceRow
            label="Order placed"
            enabled={prefs.order_placed_enabled === 1}
            onToggle={() => handleTogglePref('order_placed_enabled')}
          />
        </Card>
      )}
    </div>
  );
};

const NotificationList = ({ items, emptyMessage, onRead }) => {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyMessage}
        message="Check back later for new activity."
      />
    );
  }
  return items.map(n => (
    <NotificationCard key={n.notification_id} notification={n} onRead={onRead} />
  ));
};

export default Notifications;
