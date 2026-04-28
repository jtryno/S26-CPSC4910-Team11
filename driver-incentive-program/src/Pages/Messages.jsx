import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  sendMessage, fetchAnnouncements, fetchOrgChat, fetchThread,
  markMessageRead, fetchOrgDrivers, fetchMySponsorUsers,
} from '../api/MessageApi';
import { PageHeader, Button, Badge, Tabs, EmptyState, Alert, Card, FormField } from '../components/ui';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

const PRIORITY_VAL = { LOW: '[LOW] ', HIGH: '[HIGH] ', URGENT: '[URGENT] ' };

const PRIORITY_TONE = { '[LOW]': 'success', '[HIGH]': 'warning', '[URGENT]': 'danger' };
const PRIORITY_LABEL = { '[LOW]': 'LOW', '[HIGH]': 'HIGH', '[URGENT]': 'URGENT' };

const TYPE_TONE = {
  direct: 'info', org_announcement: 'success',
  global_announcement: 'neutral', org_chat: 'warning',
};
const TYPE_LABEL = {
  direct: 'Direct', org_announcement: 'Org',
  global_announcement: 'Global', org_chat: 'Org Chat',
};

function getPriorityKey(subject) {
  if (!subject) return null;
  return Object.keys(PRIORITY_LABEL).find(k => subject.startsWith(k)) || null;
}

const PriorityBadge = ({ subject }) => {
  const key = getPriorityKey(subject);
  if (!key) return null;
  return <Badge tone={PRIORITY_TONE[key]}>{PRIORITY_LABEL[key]}</Badge>;
};

const TypeBadge = ({ type }) => (
  <Badge tone={TYPE_TONE[type] || 'neutral'}>{TYPE_LABEL[type] || type}</Badge>
);

const ChatBubble = ({ msg, isMe }) => (
  <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 'var(--space-3)' }}>
    <div style={{ maxWidth: '70%' }}>
      {!isMe && (
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '0 0 var(--space-1) var(--space-1)' }}>
          {msg.sender_username}
        </p>
      )}
      <div style={{
        padding: 'var(--space-2) var(--space-4)',
        borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isMe ? 'var(--color-primary)' : 'var(--color-surface)',
        border: isMe ? 'none' : '1px solid var(--color-border)',
        color: isMe ? '#fff' : 'var(--color-text)',
        fontSize: 'var(--font-size-sm)',
        lineHeight: 'var(--line-height-relaxed)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.body}
      </div>
      <p style={{
        fontSize: 'var(--font-size-xs)', color: 'var(--color-text-faint)',
        margin: 'var(--space-1) var(--space-1) 0',
        textAlign: isMe ? 'right' : 'left',
      }}>
        {formatDate(msg.created_at)}
      </p>
    </div>
  </div>
);

const ChatThread = ({ messages, currentUserId, loading, bottomRef }) => {
  if (loading) return <div style={{ padding: 'var(--space-5)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Loading…</div>;
  if (messages.length === 0) return (
    <EmptyState title="No messages yet" message="Start the conversation!" />
  );
  return (
    <>
      {messages.map(msg => (
        <ChatBubble key={msg.message_id} msg={msg} isMe={msg.sender_id === currentUserId} />
      ))}
      <div ref={bottomRef} />
    </>
  );
};

const ChatInput = ({ value, onChange, onSend, sending, placeholder = 'Type a message… (Enter to send)' }) => (
  <div style={{
    padding: 'var(--space-3) var(--space-4)',
    borderTop: '1px solid var(--color-border-light)',
    display: 'flex', gap: 'var(--space-2)',
    alignItems: 'flex-end',
    background: 'var(--color-surface)',
  }}>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
      placeholder={placeholder}
      rows={2}
      maxLength={300}
      style={{
        flex: 1, padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
        fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)',
        resize: 'none',
      }}
    />
    <Button onClick={onSend} loading={sending} style={{ flexShrink: 0, alignSelf: 'flex-end' }}>Send</Button>
  </div>
);

const AnnouncementsTab = ({ currentUser, orgId }) => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('');
  const [announcementType, setAnnouncementType] = useState(
    currentUser.user_type === 'admin' ? 'global_announcement' : 'org_announcement'
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [allOrgs, setAllOrgs] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(null);

  const canPost = currentUser.user_type === 'admin' || currentUser.user_type === 'sponsor';

  useEffect(() => {
    if (currentUser.user_type !== 'admin') return;
    fetch('/api/organization')
      .then(r => r.json())
      .then(data => {
        const orgs = data.organizations || [];
        setAllOrgs(orgs);
        if (orgs.length > 0) setSelectedOrgId(orgs[0].sponsor_org_id);
      })
      .catch(() => {});
  }, [currentUser.user_type]);

  const load = useCallback(async () => {
    const msgs = await fetchAnnouncements(currentUser.user_id);
    setAnnouncements(msgs);
    setLoading(false);
  }, [currentUser.user_id]);

  useEffect(() => { load(); }, [load]);

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    setError('');
    try {
      let targetOrgId = null;
      if (announcementType === 'org_announcement') {
        targetOrgId = currentUser.user_type === 'admin' ? Number(selectedOrgId) : Number(orgId);
      }
      if (announcementType === 'org_announcement' && !targetOrgId) {
        setError('Please select an organization.');
        setSending(false);
        return;
      }
      await sendMessage({
        sender_id: currentUser.user_id,
        recipient_id: null,
        sponsor_org_id: targetOrgId,
        message_type: announcementType,
        message_subject: priority + subject.trim(),
        body: body.trim(),
      });
      setBody(''); setSubject(''); setPriority(''); setShowCompose(false);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      {canPost && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          {!showCompose ? (
            <Button onClick={() => setShowCompose(true)}>+ New Announcement</Button>
          ) : (
            <Card>
              <h3 style={{ margin: '0 0 var(--space-4)', fontSize: 'var(--font-size-base)' }}>New Announcement</h3>
              {error && <Alert tone="danger" style={{ marginBottom: 'var(--space-4)' }}>{error}</Alert>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {currentUser.user_type === 'admin' && (
                  <FormField label="Type" htmlFor="ann-type">
                    <select id="ann-type" className="ui-select ui-select--full" value={announcementType} onChange={e => setAnnouncementType(e.target.value)}>
                      <option value="global_announcement">Global (all users)</option>
                      <option value="org_announcement">Org only</option>
                    </select>
                  </FormField>
                )}
                {currentUser.user_type === 'admin' && announcementType === 'org_announcement' && (
                  <FormField label="Organization" htmlFor="ann-org">
                    <select id="ann-org" className="ui-select ui-select--full" value={selectedOrgId || ''} onChange={e => setSelectedOrgId(Number(e.target.value))}>
                      {allOrgs.map(org => <option key={org.sponsor_org_id} value={org.sponsor_org_id}>{org.name}</option>)}
                    </select>
                  </FormField>
                )}
                <FormField label="Priority" htmlFor="ann-priority">
                  <select id="ann-priority" className="ui-select ui-select--full" value={priority} onChange={e => setPriority(e.target.value)}>
                    <option value="">Normal</option>
                    <option value={PRIORITY_VAL.LOW}>Low</option>
                    <option value={PRIORITY_VAL.HIGH}>High</option>
                    <option value={PRIORITY_VAL.URGENT}>Urgent</option>
                  </select>
                </FormField>
                <FormField label="Subject" htmlFor="ann-subject">
                  <input id="ann-subject" type="text" className="ui-input ui-input--full" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Announcement subject" maxLength={50} />
                </FormField>
                <FormField label="Message" htmlFor="ann-body">
                  <textarea id="ann-body" className="ui-textarea ui-textarea--full" value={body} onChange={e => setBody(e.target.value)} placeholder="Write your announcement" maxLength={300} rows={4} />
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-faint)', textAlign: 'right', margin: 0 }}>{body.length}/300</p>
                </FormField>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Button onClick={handleSend} loading={sending}>Send Announcement</Button>
                  <Button variant="secondary" onClick={() => { setShowCompose(false); setError(''); setBody(''); setSubject(''); setPriority(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {loading && <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Loading announcements…</div>}
      {!loading && announcements.length === 0 && (
        <EmptyState title="No announcements yet" message="Announcements from your organization will appear here." />
      )}
      {!loading && announcements.map(msg => (
        <div key={msg.message_id} style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', padding: 'var(--space-4) var(--space-5)',
          marginBottom: 'var(--space-3)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <PriorityBadge subject={msg.message_subject} />
              <TypeBadge type={msg.message_type} />
              {msg.message_subject && (
                <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)', color: 'var(--color-text)' }}>
                  {msg.message_subject}
                </span>
              )}
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-faint)', flexShrink: 0, marginLeft: 'var(--space-3)' }}>
              {formatDate(msg.created_at)}
            </span>
          </div>
          <p style={{ margin: '0 0 var(--space-2)', color: 'var(--color-text)', fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-relaxed)', whiteSpace: 'pre-wrap' }}>
            {msg.body}
          </p>
          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            — {msg.sender_username}
          </p>
        </div>
      ))}
    </div>
  );
};

const DirectChatView = ({ currentUser, otherUser, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    const msgs = await fetchThread(currentUser.user_id, otherUser.user_id);
    setMessages(msgs);
    setLoading(false);
    for (const msg of msgs) {
      if (!msg.read_at && msg.recipient_id === currentUser.user_id) markMessageRead(msg.message_id);
    }
  }, [currentUser.user_id, otherUser.user_id]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 5000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      await sendMessage({ sender_id: currentUser.user_id, recipient_id: otherUser.user_id, sponsor_org_id: null, message_type: 'direct', message_subject: null, body: body.trim() });
      setBody('');
      await load();
    } finally { setSending(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-surface)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>
          ← Back
        </button>
        <div>
          <p style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)', color: 'var(--color-text)', margin: 0 }}>{otherUser.username}</p>
          {otherUser.org_name && <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>{otherUser.org_name}</p>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', minHeight: 0 }}>
        <ChatThread messages={messages} currentUserId={currentUser.user_id} loading={loading} bottomRef={bottomRef} />
      </div>
      <ChatInput value={body} onChange={setBody} onSend={handleSend} sending={sending} />
    </div>
  );
};

const DirectMessagesTab = ({ currentUser, contacts }) => {
  const [selectedContact, setSelectedContact] = useState(null);

  if (contacts.length === 0) {
    const msg = currentUser.user_type === 'driver'
      ? 'You are not currently affiliated with any organization.'
      : 'No drivers in your organization yet.';
    return <EmptyState title="No contacts" message={msg} />;
  }

  if (selectedContact) {
    return (
      <div style={{ height: 560, display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <DirectChatView currentUser={currentUser} otherUser={selectedContact} onBack={() => setSelectedContact(null)} />
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)', marginTop: 0 }}>
        {currentUser.user_type === 'driver' ? 'Your sponsor contacts:' : 'Your driver contacts:'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {contacts.map(contact => (
          <div
            key={contact.user_id}
            onClick={() => setSelectedContact(contact)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 'var(--space-4)',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)', cursor: 'pointer',
              transition: 'background var(--transition-base)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-alt)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}
          >
            <div>
              <p style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)', color: 'var(--color-text)', margin: 0 }}>{contact.username}</p>
              {contact.org_name && <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 'var(--space-1) 0 0' }}>{contact.org_name}</p>}
            </div>
            <span style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' }}>Message →</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const OrgChatTab = ({ currentUser, orgId }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    const msgs = await fetchOrgChat(orgId);
    setMessages(msgs);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 5000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      await sendMessage({ sender_id: currentUser.user_id, sponsor_org_id: Number(orgId), message_type: 'org_chat', message_subject: null, body: body.trim() });
      setBody('');
      await load();
    } finally { setSending(false); }
  };

  if (!orgId) return <EmptyState title="No organization" message="You are not affiliated with an organization." />;

  return (
    <div style={{ height: 560, display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-surface)' }}>
        <p style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)', color: 'var(--color-text)', margin: 0 }}>Sponsor Org Chat</p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 'var(--space-1) 0 0' }}>Visible to all sponsors and admins in this organization</p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', minHeight: 0 }}>
        <ChatThread messages={messages} currentUserId={currentUser.user_id} loading={loading} bottomRef={bottomRef} />
      </div>
      <ChatInput value={body} onChange={setBody} onSend={handleSend} sending={sending} placeholder="Type a message… (Enter to send, Shift+Enter for new line)" />
    </div>
  );
};

const Messages = () => {
  const userData = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');
  const [tabIndex, setTabIndex] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [orgId, setOrgId] = useState(userData?.sponsor_org_id || null);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [adminOrgs, setAdminOrgs] = useState([]);
  const [adminOrgId, setAdminOrgId] = useState(null);

  const isDriver  = userData?.user_type === 'driver';
  const isSponsor = userData?.user_type === 'sponsor';
  const isAdmin   = userData?.user_type === 'admin';
  const showOrgChat = isSponsor && orgId;

  useEffect(() => {
    if (!userData) return;
    const init = async () => {
      if (isSponsor) {
        const data = await fetchOrgDrivers(userData.user_id);
        setContacts(data.drivers || []);
        if (data.sponsor_org_id) setOrgId(data.sponsor_org_id);
      } else if (isDriver) {
        const data = await fetchMySponsorUsers(userData.user_id);
        setContacts(data);
      } else if (isAdmin) {
        try {
          const r = await fetch('/api/organization');
          const data = await r.json();
          const orgs = data.organizations || [];
          setAdminOrgs(orgs);
          if (orgs.length > 0) setAdminOrgId(orgs[0].sponsor_org_id);
        } catch { /* non-critical */ }
      }
      setLoadingContacts(false);
    };
    init();
  // userData is stable (parsed once from storage) — intentionally omitting derived booleans
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!userData) return <div style={{ padding: 'var(--space-10)', color: 'var(--color-text-muted)' }}>Please log in.</div>;

  const tabDefs = [{ label: 'Announcements' }];
  if (isDriver || isSponsor) tabDefs.push({ label: isSponsor ? 'Driver Messages' : 'Messages' });
  if (showOrgChat || (isAdmin && adminOrgs.length > 0)) tabDefs.push({ label: 'Org Chat' });

  const subtitle = isDriver  ? 'View announcements and message your sponsor.'
    : isSponsor ? 'Send announcements and communicate with your drivers.'
    : isAdmin   ? 'Send global announcements to all users.'
    : '';

  const renderPanel = () => {
    const tabKey = tabDefs[tabIndex]?.label;
    if (tabKey === 'Announcements') return <AnnouncementsTab currentUser={userData} orgId={orgId} />;
    if (tabKey === 'Messages' || tabKey === 'Driver Messages') {
      if (loadingContacts) return <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Loading…</div>;
      return <DirectMessagesTab currentUser={userData} contacts={contacts} />;
    }
    if (tabKey === 'Org Chat') {
      if (showOrgChat) return <OrgChatTab currentUser={userData} orgId={orgId} />;
      if (isAdmin) return (
        <div>
          <FormField label="Organization" htmlFor="admin-org-select" style={{ marginBottom: 'var(--space-4)' }}>
            <select id="admin-org-select" className="ui-select ui-select--full" value={adminOrgId || ''} onChange={e => setAdminOrgId(Number(e.target.value))}>
              {adminOrgs.map(org => <option key={org.sponsor_org_id} value={org.sponsor_org_id}>{org.name}</option>)}
            </select>
          </FormField>
          {adminOrgId && <OrgChatTab currentUser={userData} orgId={adminOrgId} />}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <PageHeader title="Messages" subtitle={subtitle} />
      <Tabs tabs={tabDefs.map(t => ({ label: t.label, content: null }))} activeIndex={tabIndex} onChange={setTabIndex} />
      <div style={{ marginTop: 'var(--space-4)' }}>{renderPanel()}</div>
    </div>
  );
};

export default Messages;
