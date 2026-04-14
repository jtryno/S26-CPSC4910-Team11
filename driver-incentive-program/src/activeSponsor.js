// Driver "active sponsor" context.
//
// Drivers can belong to multiple sponsor organizations. The navbar exposes a
// dropdown that sets which sponsor the app should currently behave as — the
// catalog, cart, and points screens all read from here rather than from a
// single sponsor_org_id on the user object.
//
// The selection is persisted in localStorage so it survives refreshes, and a
// custom 'activeSponsorChanged' event is dispatched whenever it changes so
// pages can refetch without prop drilling.

const STORAGE_KEY = 'active_sponsor_org_id';
const EVENT_NAME = 'activeSponsorChanged';

function getStoredUser() {
    const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

export function getDriverSponsors() {
    const user = getStoredUser();
    if (!user || user.user_type !== 'driver') return [];
    return Array.isArray(user.sponsors) ? user.sponsors : [];
}

// Returns the currently active sponsor_org_id for a driver. Falls back to the
// first sponsor in the list (or the legacy user.sponsor_org_id) so behavior
// matches the single-sponsor case when the user has exactly one affiliation.
export function getActiveSponsorOrgId() {
    const user = getStoredUser();
    if (!user) return null;
    if (user.user_type !== 'driver') return user.sponsor_org_id ?? null;

    const sponsors = Array.isArray(user.sponsors) ? user.sponsors : [];
    const storedRaw = localStorage.getItem(STORAGE_KEY);
    const stored = storedRaw ? Number(storedRaw) : null;
    if (stored && sponsors.some(s => Number(s.sponsor_org_id) === stored)) {
        return stored;
    }
    if (sponsors.length > 0) return Number(sponsors[0].sponsor_org_id);
    return user.sponsor_org_id ?? null;
}

export function getActiveSponsor() {
    const id = getActiveSponsorOrgId();
    if (!id) return null;
    const sponsors = getDriverSponsors();
    return sponsors.find(s => Number(s.sponsor_org_id) === Number(id)) || null;
}

export function setActiveSponsorOrgId(sponsorOrgId) {
    if (sponsorOrgId == null) {
        localStorage.removeItem(STORAGE_KEY);
    } else {
        localStorage.setItem(STORAGE_KEY, String(sponsorOrgId));
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { sponsorOrgId } }));
}

export function clearActiveSponsor() {
    localStorage.removeItem(STORAGE_KEY);
}

// Call after sponsors[] on the stored user changes (e.g. after leaving an org)
// so the active sponsor doesn't dangle pointing at an org the driver no longer
// belongs to. If the current selection is gone, fall back to the first
// remaining sponsor and broadcast the change so subscribers refetch.
export function reconcileActiveSponsor() {
    const sponsors = getDriverSponsors();
    const storedRaw = localStorage.getItem(STORAGE_KEY);
    const stored = storedRaw ? Number(storedRaw) : null;
    const stillValid = stored && sponsors.some(s => Number(s.sponsor_org_id) === stored);
    if (stillValid) return;

    if (sponsors.length === 0) {
        clearActiveSponsor();
    } else {
        localStorage.setItem(STORAGE_KEY, String(sponsors[0].sponsor_org_id));
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: { sponsorOrgId: sponsors[0]?.sponsor_org_id ?? null }
    }));
}

export function onActiveSponsorChange(handler) {
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
}

export const ACTIVE_SPONSOR_EVENT = EVENT_NAME;
