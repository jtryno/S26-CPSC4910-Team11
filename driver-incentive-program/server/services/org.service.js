import pool from '../db.js';

export async function getSponsorOrgId(userId, userType) {
    if (userType === 'driver') {
        const [rows] = await pool.query(
            `SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ? AND driver_status = 'active' AND is_archived = 0`,
            [userId]
        );
        return rows.length > 0 ? rows[0].sponsor_org_id : null;
    } else if (userType === 'sponsor') {
        const [rows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [userId]
        );
        return rows.length > 0 ? rows[0].sponsor_org_id : null;
    }
    return null;
}

export async function getDriverSponsors(userId) {
    const [rows] = await pool.query(
        `SELECT ds.sponsor_org_id, so.name, ds.driver_status
         FROM driver_sponsor ds
         JOIN sponsor_organization so ON so.sponsor_org_id = ds.sponsor_org_id
         WHERE ds.driver_user_id = ?
           AND ds.driver_status = 'active'
           AND ds.is_archived = 0
         ORDER BY so.name ASC`,
        [userId]
    );
    return rows;
}

export async function buildUserPayload(user) {
    const sponsor_org_id = await getSponsorOrgId(user.user_id, user.user_type);
    const payload = { ...user, sponsor_org_id };
    if (user.user_type === 'driver') {
        payload.sponsors = await getDriverSponsors(user.user_id);
    }
    return payload;
}
