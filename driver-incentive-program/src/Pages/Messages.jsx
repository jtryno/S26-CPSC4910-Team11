import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
    sendMessage,
    fetchAnnouncements,
    fetchOrgChat,
    fetchThread,
    markMessageRead,
    fetchOrgDrivers,
    fetchMySponsorUsers,
} from '../api/MessageApi';


function formatDate(dateStr) {
    if(!dateStr) {
        return '';
    }
    return new Date(dateStr).toLocaleString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,});
}

const PRIORITY_VAL = {LOW: '[LOW] ', HIGH: '[HIGH] ', URGENT: '[URGENT] '};

const PRIORITY_STYLES = {
    '[LOW]':    {label: 'LOW',    color: '#558b2f', bg: '#fff', border: '#a5d174'},
    '[HIGH]':   {label: 'HIGH',   color: '#ff5900', bg: '#fff', border: '#d9a351'},
    '[URGENT]': {label: 'URGENT', color: '#b71c1c', bg: '#fff', border: '#c06363'},
};

function getPriority(subject) {
    if(!subject) {
        return null;
    }
    for(let key of Object.keys(PRIORITY_STYLES)) {
        if(subject.startsWith(key)) {
            return key;
        }
    }
    return null;
}

const PriorityBadge = ({subject}) => {
    const p = getPriority(subject);
    if(!p) {
        return null;
    }
    const s = PRIORITY_STYLES[p];
    return (
        <span style={{
            display: 'inline-block',
            padding: '1px 8px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: '700',
            background: s.bg,
            color: s.color,
            border: `1px solid ${s.border}`,
            marginRight: '6px',
            letterSpacing: '0.3px',
        }}>
            {s.label}
        </span>
    );
};

const TypeBadge = ({type}) => {
    const meta = {
        direct: {label: 'Direct', color: '#1565c0', bg: '#fff'},
        org_announcement: {label: 'Org', color: '#2e7d32', bg: '#fff'},
        global_announcement: {label: 'Global', color: '#6a1b9a', bg: '#fff'},
        org_chat:{label: 'Org Chat', color: '#e65100', bg: '#fff'},
    }[type] || {label: type, color: '#666', bg: '#fff'};
    return (
        <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: '600',
            background: meta.bg,
            color: meta.color,
        }}>
            {meta.label}
        </span>
    );
};


const ChatThread = ({messages, currentUserId, loading, bottomRef}) => {
    if(loading) {
        return <div style={{padding: '20px', color: '#888', fontSize: '14px'}}>Loading...</div>;
    }
    if(messages.length === 0) {
        return (
            <div style={{padding: '40px 20px', textAlign: 'center', color: '#999', fontSize: '14px'}}>
                No messages yet. Start the conversation!
            </div>
        );
    }
    return (
        <>
            {messages.map(msg => {
                const isMe = msg.sender_id === currentUserId;

                let bubbleJustify = 'flex-start';
                if(isMe) {
                    bubbleJustify = 'flex-end';
                }

                let bubbleBorderRadius = '14px 14px 14px 4px';
                if(isMe) {
                    bubbleBorderRadius = '14px 14px 4px 14px';
                }

                let bubbleBackground = '#fff';
                if(isMe) {
                    bubbleBackground = '#0066cc';
                }

                let bubbleColor = '#1a1a1a';
                if(isMe) {
                    bubbleColor = '#fff';
                }

                let timestampAlign = 'left';
                if(isMe) {
                    timestampAlign = 'right';
                }

                return (
                    <div key={msg.message_id} style={{display: 'flex', justifyContent: bubbleJustify, marginBottom: '10px'}}>
                        <div style={{maxWidth: '70%'}}>
                            {!isMe && (
                                <div style={{fontSize: '11px', color: '#888', marginBottom: '3px', paddingLeft: '4px'}}>
                                    {msg.sender_username}
                                </div>
                            )}
                            <div style={{
                                padding: '10px 14px',
                                borderRadius: bubbleBorderRadius,
                                background: bubbleBackground,
                                color: bubbleColor,
                                fontSize: '14px',
                                lineHeight: '1.5',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}>
                                {msg.body}
                            </div>
                            <div style={{fontSize: '10px', color: '#bbb', marginTop: '2px', textAlign: timestampAlign, paddingLeft: '4px', paddingRight: '4px'}}>
                                {formatDate(msg.created_at)}
                            </div>
                        </div>
                    </div>
                );
            })}
            <div ref={bottomRef} />
        </>
    );
};


const ChatInput = ({value, onChange, onSend, sending, placeholder = 'Type a message… (Enter to send)'}) => {
    let buttonBackground = '#0066cc';
    if(sending) {
        buttonBackground = '#fff';
    }

    let buttonColor = '#fff';
    if(sending) {
        buttonColor = '#999';
    }

    let buttonCursor = 'pointer';
    if(sending) {
        buttonCursor = 'not-allowed';
    }

    return (
        <div style={{padding: '12px 16px', borderTop: '1px solid #fff', display: 'flex', gap: '10px', alignItems: 'flex-end', background: '#fff'}}>
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => {
                    //shift enter is new line
                    if(e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onSend();
                    }
                }}
                placeholder={placeholder}
                rows={2}
                maxLength={300}
                style={{flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '14px', fontFamily: 'inherit', resize: 'none'}}
            />
            <button
                onClick={onSend}
                disabled={sending}
                style={{
                    padding: '8px 18px',
                    background: buttonBackground,
                    color: buttonColor,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: buttonCursor,
                    fontWeight: '600',
                    fontSize: '14px',
                    flexShrink: 0,
                    alignSelf: 'flex-end',
                }}
            >
                Send
            </button>
        </div>
    );
};



const AnnouncementsTab = ({currentUser, orgId}) => {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCompose, setShowCompose] = useState(false);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [priority, setPriority] = useState('');
    let initialAnnouncementType = 'org_announcement';
    if(currentUser.user_type === 'admin') {
        initialAnnouncementType = 'global_announcement';
    }
    const [announcementType, setAnnouncementType] = useState(initialAnnouncementType);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    const canPost = currentUser.user_type === 'admin' || currentUser.user_type === 'sponsor';
    const [allOrgs, setAllOrgs] = useState([]);
    const [selectedOrgId, setSelectedOrgId] = useState(null);

    useEffect(() => {
        if(currentUser.user_type !== 'admin') {
            return;
        }
        fetch('/api/organization')
            .then(r => r.json())
            .then(data => {
                const orgs = data.organizations || [];
                setAllOrgs(orgs);
                if(orgs.length > 0) {
                    setSelectedOrgId(orgs[0].sponsor_org_id);
                }
            })
            .catch(() => {});
    }, [currentUser.user_type]);

    const load = useCallback(async () => {
        const msgs = await fetchAnnouncements(currentUser.user_id);
        setAnnouncements(msgs);
        setLoading(false);
    }, [currentUser.user_id]);

    useEffect(() => {load();}, [load]);

    const handleSend = async () => {
        if(sending) {
            return;
        }
        setSending(true);
        setError('');
        try {
            let targetOrgId = null;
            if(announcementType === 'org_announcement') {
                if(currentUser.user_type === 'admin') {
                    targetOrgId = Number(selectedOrgId);
                } else {
                    targetOrgId = Number(orgId);
                }
            }
            if(announcementType === 'org_announcement' && !targetOrgId) {
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
            setBody('');
            setSubject('');
            setPriority('');
            setShowCompose(false);
            await load();
        } catch(err) {
            setError(err.message || 'Failed to send.');
        } finally {
            setSending(false);
        }
    };

    let sendButtonBackground = '#0066cc';
    if(sending) {
        sendButtonBackground = '#fff';
    }

    let sendButtonColor = '#fff';
    if(sending) {
        sendButtonColor = '#999';
    }

    let sendButtonLabel = 'Send Announcement';
    if(sending) {
        sendButtonLabel = 'Sending...';
    }

    let sendButtonCursor = 'pointer';
    if(sending) {
        sendButtonCursor = 'not-allowed';
    }

    return (
        <div>
            {canPost && (
                <div style={{marginBottom: '20px'}}>
                    {!showCompose && (
                        <button
                            onClick={() => setShowCompose(true)}
                            style={{padding: '8px 18px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'}}
                        >
                            + New Announcement
                        </button>
                    )}
                    {showCompose && (
                        <div style={{background: '#fff', border: '1px solid #fff', borderRadius: '8px', padding: '20px'}}>
                            <h3 style={{margin: '0 0 16px 0', color: '#1a1a1a', fontSize: '16px'}}>New Announcement</h3>

                            {error && (
                                <div style={{marginBottom: '12px', padding: '8px 12px', background: '#fff', color: '#c62828', borderRadius: '4px', fontSize: '13px'}}>
                                    {error}
                                </div>
                            )}

                            {currentUser.user_type === 'admin' && (
                                <div style={{marginBottom: '12px'}}>
                                    <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#444', marginBottom: '4px'}}>Type</label>
                                    <select
                                        value={announcementType}
                                        onChange={e => setAnnouncementType(e.target.value)}
                                        style={{padding: '8px 10px', borderRadius: '4px', border: '1px solid #fff', fontSize: '14px', fontFamily: 'inherit', width: '100%'}}
                                    >
                                        <option value="global_announcement">Global (all users)</option>
                                        <option value="org_announcement">Org only</option>
                                    </select>
                                </div>
                            )}

                            {currentUser.user_type === 'admin' && announcementType === 'org_announcement' && (
                                <div style={{marginBottom: '12px'}}>
                                    <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#444', marginBottom: '4px'}}>Organization</label>
                                    <select
                                        value={selectedOrgId || ''}
                                        onChange={e => setSelectedOrgId(Number(e.target.value))}
                                        style={{padding: '8px 10px', borderRadius: '4px', border: '1px solid #fff', fontSize: '14px', fontFamily: 'inherit', width: '100%'}}
                                    >
                                        {allOrgs.map(org => (
                                            <option key={org.sponsor_org_id} value={org.sponsor_org_id}>
                                                {org.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div style={{marginBottom: '12px'}}>
                                <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#444', marginBottom: '4px'}}>Priority</label>
                                <select
                                    value={priority}
                                    onChange={e => setPriority(e.target.value)}
                                    style={{padding: '8px 10px', borderRadius: '4px', border: '1px solid #fff', fontSize: '14px', fontFamily: 'inherit', width: '100%'}}
                                >
                                    <option value="">Normal</option>
                                    <option value={PRIORITY_VAL.LOW}>Low</option>
                                    <option value={PRIORITY_VAL.HIGH}>High</option>
                                    <option value={PRIORITY_VAL.URGENT}>Urgent</option>
                                </select>
                            </div>

                            <div style={{marginBottom: '12px'}}>
                                <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#444', marginBottom: '4px'}}>Subject</label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={e => setSubject(e.target.value)}
                                    placeholder="Announcement subject"
                                    maxLength={50}
                                    style={{width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #fff', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box'}}
                                />
                            </div>

                            <div style={{marginBottom: '16px'}}>
                                <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#444', marginBottom: '4px'}}>Message</label>
                                <textarea
                                    value={body}
                                    onChange={e => setBody(e.target.value)}
                                    placeholder="Write your announcement"
                                    maxLength={300}
                                    rows={4}
                                    style={{width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #fff', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'}}
                                />
                                <div style={{fontSize: '11px', color: '#aaa', textAlign: 'right'}}>{body.length}/300</div>
                            </div>

                            <div style={{display: 'flex', gap: '10px'}}>
                                <button
                                    onClick={handleSend}
                                    disabled={sending}
                                    style={{padding: '8px 20px', background: sendButtonBackground, color: sendButtonColor, border: 'none', borderRadius: '6px', cursor: sendButtonCursor, fontWeight: '600', fontSize: '14px'}}
                                >
                                    {sendButtonLabel}
                                </button>
                                <button
                                    onClick={() => {setShowCompose(false); setError(''); setBody(''); setSubject(''); setPriority('');}}
                                    style={{padding: '8px 20px', background: '#fff', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'}}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {loading && <div style={{color: '#888', fontSize: '14px'}}>Loading announcements...</div>}
            {!loading && announcements.length === 0 && (
                <div style={{color: '#999', fontSize: '14px', padding: '40px 0', textAlign: 'center'}}>No announcements yet.</div>
            )}
            {!loading && announcements.map(msg => {
                return (
                    <div key={msg.message_id} style={{background: '#fff', border: '1px solid #fff', borderRadius: '8px', padding: '16px 20px', marginBottom: '12px'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px'}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                                <PriorityBadge subject={msg.message_subject} />
                                <TypeBadge type={msg.message_type} />
                                {msg.message_subject && (
                                    <span style={{fontWeight: '600', fontSize: '15px', color: '#1a1a1a'}}>{msg.message_subject}</span>
                                )}
                            </div>
                            <span style={{fontSize: '12px', color: '#aaa', flexShrink: 0, marginLeft: '12px'}}>
                                {formatDate(msg.created_at)}
                            </span>
                        </div>
                        <p style={{margin: '0 0 8px 0', color: '#333', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap'}}>
                            {msg.body}
                        </p>
                        <div style={{fontSize: '12px', color: '#888'}}>
                            — {msg.sender_username}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};


const DirectChatView = ({currentUser, otherUser, onBack}) => {
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
        // mark unread messages as read
        for(const msg of msgs) {
            if(!msg.read_at && msg.recipient_id === currentUser.user_id) {
                markMessageRead(msg.message_id);
            }
        }
    }, [currentUser.user_id, otherUser.user_id]);

    useEffect(() => {
        load();
        pollRef.current = setInterval(load, 5000);
        return () => clearInterval(pollRef.current);
    }, [load]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    const handleSend = async () => {
        if(sending) {
            return;
        }
        setSending(true);
        try {
            await sendMessage({
                sender_id: currentUser.user_id,
                recipient_id: otherUser.user_id,
                sponsor_org_id: null,
                message_type: 'direct',
                message_subject: null,
                body: body.trim(),
            });
            setBody('');
            await load();
        } finally {
            setSending(false);
        }
    };

    return (
        <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #fff', background: '#fff'}}>
                <button
                    onClick={onBack}
                    style={{background: 'none', border: 'none', cursor: 'pointer', color: '#0066cc', fontWeight: '600', fontSize: '14px', padding: '4px 8px 4px 0'}}
                >
                    ← Back
                </button>
                <div>
                    <div style={{fontWeight: '600', fontSize: '15px', color: '#1a1a1a' }}>{otherUser.username}</div>
                    {otherUser.org_name && (
                        <div style={{fontSize: '12px', color: '#888'}}>{otherUser.org_name}</div>
                    )}
                </div>
            </div>

            <div style={{flex: 1, overflowY: 'auto', padding: '16px', minHeight: 0}}>
                <ChatThread
                    messages={messages}
                    currentUserId={currentUser.user_id}
                    loading={loading}
                    bottomRef={bottomRef}
                />
            </div>

            <ChatInput value={body} onChange={setBody} onSend={handleSend} sending={sending} />
        </div>
    );
};


const DirectMessagesTab = ({currentUser, contacts}) => {
    const [selectedContact, setSelectedContact] = useState(null);

    if(contacts.length === 0) {
        let emptyMessage = 'No drivers in your organization yet.';
        if(currentUser.user_type === 'driver') {
            emptyMessage = 'You are not currently affiliated with any organization.';
        }
        return (
            <div style={{color: '#999', fontSize: '14px', padding: '40px 0', textAlign: 'center'}}>
                {emptyMessage}
            </div>
        );
    }

    if(selectedContact) {
        return (
            <div style={{height: '560px', display: 'flex', flexDirection: 'column', border: '1px solid #fff', borderRadius: '8px', overflow: 'hidden'}}>
                <DirectChatView
                    currentUser={currentUser}
                    otherUser={selectedContact}
                    onBack={() => setSelectedContact(null)}
                />
            </div>
        );
    }

    let contactsLabel = 'Your driver contacts:';
    if(currentUser.user_type === 'driver') {
        contactsLabel = 'Your sponsor contacts:';
    }

    return (
        <div>
            <p style={{color: '#888', fontSize: '13px', marginBottom: '16px', marginTop: '0'}}>
                {contactsLabel}
            </p>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                {contacts.map(contact => (
                    <div
                        key={contact.user_id}
                        onClick={() => setSelectedContact(contact)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '14px 16px',
                            background: '#fff',
                            border: '1px solid #fff',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                        }}
                    >
                        <div>
                            <div style={{fontWeight: '600', fontSize: '15px', color: '#1a1a1a'}}>{contact.username}</div>
                            {contact.org_name && (
                                <div style={{fontSize: '12px', color: '#888', marginTop: '2px'}}>{contact.org_name}</div>
                            )}
                        </div>
                        <span style={{color: '#0066cc', fontSize: '13px', fontWeight: '600'}}>Message →</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const OrgChatTab = ({currentUser, orgId}) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);
    const pollRef = useRef(null);

    const load = useCallback(async () => {
        if(!orgId) return;
        const msgs = await fetchOrgChat(orgId);
        setMessages(msgs);
        setLoading(false);
    }, [orgId]);

    useEffect(() => {
        load();
        pollRef.current = setInterval(load, 5000);
        return () => clearInterval(pollRef.current);
    }, [load]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    const handleSend = async () => {
        if(sending) {
            return;
        }
        setSending(true);
        try {
            await sendMessage({
                sender_id: currentUser.user_id,
                sponsor_org_id: Number(orgId),
                message_type: 'org_chat',
                message_subject: null,
                body: body.trim(),
            });
            setBody('');
            await load();
        } finally {
            setSending(false);
        }
    };

    if(!orgId) {
        return (
            <div style={{color: '#999', fontSize: '14px', padding: '40px 0', textAlign: 'center'}}>
                You are not affiliated with an organization.
            </div>
        );
    }

    return (
        <div style={{height: '560px', display: 'flex', flexDirection: 'column', border: '1px solid #fff', borderRadius: '8px', overflow: 'hidden'}}>
            <div style={{padding: '12px 16px', borderBottom: '1px solid #fff', background: '#fff'}}>
                <div style={{fontWeight: '600', fontSize: '15px', color: '#1a1a1a'}}>Sponsor Org Chat</div>
                <div style={{fontSize: '12px', color: '#888', marginTop: '2px'}}>Visible to all sponsors and admins in this organization</div>
            </div>
            <div style={{flex: 1, overflowY: 'auto', padding: '16px', minHeight: 0}}>
                <ChatThread
                    messages={messages}
                    currentUserId={currentUser.user_id}
                    loading={loading}
                    bottomRef={bottomRef}
                />
            </div>
            <ChatInput value={body} onChange={setBody} onSend={handleSend} sending={sending} placeholder="Type a message… (Enter to send, Shift+Enter for new line)" />
        </div>
    );
};


const Messages = () => {
    const userData = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');

    const [activeTab, setActiveTab] = useState('announcements');
    const [contacts, setContacts] = useState([]);
    const [orgId, setOrgId] = useState(userData?.sponsor_org_id || null);
    const [loadingContacts, setLoadingContacts] = useState(true);
    const [adminOrgs, setAdminOrgs] = useState([]);
    const [adminOrgId, setAdminOrgId] = useState(null);

    const isDriver = userData?.user_type === 'driver';
    const isSponsor = userData?.user_type === 'sponsor';
    const isAdmin = userData?.user_type === 'admin';

    const showOrgChat = isSponsor && orgId;

    useEffect(() => {
        if(!userData) return;

        if(isSponsor) {
            fetchOrgDrivers(userData.user_id).then(data => {
                setContacts(data.drivers || []);
                if(data.sponsor_org_id) setOrgId(data.sponsor_org_id);
                setLoadingContacts(false);
            });
        } else if(isDriver) {
            fetchMySponsorUsers(userData.user_id).then(data => {
                setContacts(data);
                setLoadingContacts(false);
            });
        } else if(isAdmin) {
            fetch('/api/organization')
                .then(r => r.json())
                .then(data => {
                    const orgs = data.organizations || [];
                    setAdminOrgs(orgs);
                    if(orgs.length > 0) {
                        setAdminOrgId(orgs[0].sponsor_org_id);
                    }
                    setLoadingContacts(false);
                })
                .catch(() => setLoadingContacts(false));
        } else {
            setLoadingContacts(false);
        }
    }, []);

    if(!userData) {
        return <div style={{padding: '40px', color: '#888'}}>Please log in.</div>;
    }

    let messagesTabLabel = 'Messages';
    if(isSponsor) {
        messagesTabLabel = 'Driver Messages';
    }

    const tabs = [{key: 'announcements', label: 'Announcements'}];

    if(isDriver || isSponsor) {
        tabs.push({key: 'messages', label: messagesTabLabel});
    }

    if(showOrgChat) {
        tabs.push({key: 'org_chat', label: 'Org Chat'});
    }

    if(isAdmin && adminOrgs.length > 0) {
        tabs.push({key: 'org_chat', label: 'Org Chat'});
    }

    let subtitleText = '';
    if(isDriver) {
        subtitleText = 'View announcements and message your sponsor.';
    } else if(isSponsor) {
        subtitleText = 'Send announcements and communicate with your drivers.';
    } else if(isAdmin) {
        subtitleText = 'Send global announcements to all users.';
    }

    return (
        <div style={{maxWidth: '900px', margin: '0 auto'}}>
            <h1 style={{color: '#1a1a1a', marginBottom: '6px'}}>Messages</h1>
            <p style={{color: '#666666', marginBottom: '24px', fontSize: '0.95em'}}>
                {subtitleText}
            </p>

            <div style={{display: 'flex', borderBottom: '1px solid #fff', marginBottom: '24px'}}>
                {tabs.map((tab, index) => {
                    const isActive = activeTab === tab.key;

                    let tabBorderBottom = '3px solid transparent';
                    if(isActive) {
                        tabBorderBottom = '3px solid #0066cc';
                    }

                    let tabColor = '#333';
                    if(isActive) {
                        tabColor = '#0066cc';
                    }

                    let tabFontWeight = '400';
                    if(isActive) {
                        tabFontWeight = '700';
                    }

                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            style={{
                                flex: 1,
                                padding: '10px 20px',
                                border: 'none',
                                borderRadius: '0px',
                                borderBottom: tabBorderBottom,
                                background: '#fff',
                                color: tabColor,
                                cursor: 'pointer',
                                fontWeight: tabFontWeight,
                                fontSize: '14px',
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>
            {activeTab === 'announcements' && (
                <AnnouncementsTab currentUser={userData} orgId={orgId} />
            )}

            {activeTab === 'messages' && loadingContacts && (
                <div style={{color: '#888', fontSize: '14px'}}>Loading...</div>
            )}
            {activeTab === 'messages' && !loadingContacts && (
                <DirectMessagesTab currentUser={userData} contacts={contacts} />
            )}
            {activeTab === 'org_chat' && showOrgChat && (
                <OrgChatTab currentUser={userData} orgId={orgId} />
            )}
            {activeTab === 'org_chat' && isAdmin && (
                <div>
                    <div style={{marginBottom: '16px'}}>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#444', marginBottom: '4px'}}>Organization</label>
                        <select
                            value={adminOrgId || ''}
                            onChange={e => setAdminOrgId(Number(e.target.value))}
                            style={{padding: '8px 10px', borderRadius: '4px', border: '1px solid #fff', fontSize: '14px', fontFamily: 'inherit', width: '100%'}}
                        >
                            {adminOrgs.map(org => (
                                <option key={org.sponsor_org_id} value={org.sponsor_org_id}>
                                    {org.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {adminOrgId && (
                        <OrgChatTab currentUser={userData} orgId={adminOrgId} />
                    )}
                </div>
            )}
        </div>
    );
};

export default Messages;