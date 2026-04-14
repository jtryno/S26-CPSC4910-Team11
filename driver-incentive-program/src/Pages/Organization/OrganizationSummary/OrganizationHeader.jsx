import React from 'react';
import { useState, useEffect } from 'react';
import Field from '../../../components/Field';
import EditableField from '../../../components/EditableField';
import { updateOrganizationField } from '../../../api/OrganizationApi';
import { removeFromOrganization } from '../../../api/UserApi';
import { createApplication, withdrawApplication } from '../../../api/ApplicationApi';


const SponsorFields = ({orgData, setOrgData, numUsers}) => {
    return (
        <div>
            <EditableField label="Organization Name" value={orgData?.name || "Loading..."} onSave={async (value) => {
                const result = await updateOrganizationField(orgData.sponsor_org_id, 'name', value);
                setOrgData({...orgData, name: value});
            }}/>
            <EditableField label="Point Value" value={orgData?.point_value || "Loading..."} onSave={async (value) => {
                const result = await updateOrganizationField(orgData.sponsor_org_id, 'point_value', value);
                setOrgData({...orgData, point_value: value});
            }}/>
            <Field label="Members" value={numUsers !== null ? numUsers : "Loading..."} />
        </div>
    );
}

const DriverFields = ({orgData, numUsers}) => {
    return (
        <div >
            <Field label="Organization Name" value={orgData?.name || "Loading..."} />
            <Field label="Point Value" value={orgData?.point_value || "Loading..."} />
            <Field label="Members" value={numUsers !== null ? numUsers : "Loading..."} />
        </div>
    );
}

const OrganizationHeader = ({userData, numUsers, orgData, setOrgData, setUserData, fetchOrg, pendingApplication}) => {
    // Drivers can belong to many sponsors now, so "is the current org one of
    // mine" is answered by the sponsors list rather than the single sponsor_org_id.
    const orgSponsorId = Number(orgData?.sponsor_org_id);
    const driverSponsorIds = Array.isArray(userData?.sponsors)
        ? userData.sponsors.map(s => Number(s.sponsor_org_id))
        : [];
    const isDriverMember = userData?.user_type === 'driver' && driverSponsorIds.includes(orgSponsorId);
    const isSponsorMember = userData?.user_type === 'sponsor' && Number(userData?.sponsor_org_id) === orgSponsorId;
    const canLeave = (isDriverMember || isSponsorMember) && !!orgSponsorId;

    return (
        <div style={{ margin: '20px'}}>
            <h1 style={{ color: '#1a1a1a', marginBottom: '20px'}}>Organization Summary</h1>
            <div style={{ marginLeft: '20px', marginRight: '20px', display: 'grid', gridAutoFlow: 'column', gap: '20px'}}>
                {userData?.user_type === 'driver' || (userData?.sponsor_org_id != orgData?.sponsor_org_id && userData?.user_type !== 'admin') ? (
                    <DriverFields orgData={orgData} numUsers={numUsers} />
                ) : (
                    <SponsorFields orgData={orgData} setOrgData={setOrgData} numUsers={numUsers} />
                )}
                {canLeave &&
                    <button
                        onClick={async () => {
                            if (window.confirm("Are you sure you want to leave the organization? You will need to request to join again if you change your mind.")) {
                                await removeFromOrganization(userData.user_id, orgSponsorId);
                                fetchOrg();
                                setUserData(prev => {
                                    const nextSponsors = (prev.sponsors || []).filter(s => Number(s.sponsor_org_id) !== orgSponsorId);
                                    const nextActiveId = nextSponsors.length > 0 ? nextSponsors[0].sponsor_org_id : null;
                                    return { ...prev, sponsors: nextSponsors, sponsor_org_id: nextActiveId };
                                });
                            }
                        }}
                        style={{ height: '50px', width: '200px', marginTop: 'auto', marginLeft: 'auto', backgroundColor: '#e74c3c', color: 'white', borderRadius: '4px', padding: '0 15px' }}
                    >
                        Leave Organization
                    </button>
                }
                {/* Drivers who aren't already a member of this org can apply —
                    even if they already belong to one or more other sponsors. */}
                {userData?.user_type === 'driver' && !isDriverMember && (
                    pendingApplication ? (
                        // Driver has a pending application for this org — show status + withdraw option
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', marginLeft: 'auto' }}>
                            <button
                                disabled
                                style={{ height: '50px', width: '200px', color: 'white', borderRadius: '4px', padding: '0 15px', backgroundColor: '#95a5a6', cursor: 'not-allowed' }}
                            >
                                Pending Application
                            </button>
                            <button
                                onClick={async () => {
                                    if (window.confirm(`Are you sure you want to withdraw your application to "${orgData?.name}"?`)) {
                                        await withdrawApplication(pendingApplication.application_id);
                                        await fetchOrg();
                                    }
                                }}
                                style={{ height: '50px', width: '200px', color: 'white', borderRadius: '4px', padding: '0 15px', backgroundColor: '#e74c3c', cursor: 'pointer' }}
                            >
                                Withdraw Application
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={async () => {
                                if (window.confirm(`Are you sure you want to request to join "${orgData?.name}"?`)) {
                                    await createApplication(userData.user_id, orgData.sponsor_org_id);
                                    await fetchOrg();
                                }
                            }}
                            style={{ height: '50px', width: '200px', marginTop: 'auto', marginLeft: 'auto', color: 'white', borderRadius: '4px', padding: '0 15px', backgroundColor: '#3498db', cursor: 'pointer' }}
                        >
                            Request to Join Organization
                        </button>
                    )
                )}
            </div>
        </div>
    );
}

export default OrganizationHeader;