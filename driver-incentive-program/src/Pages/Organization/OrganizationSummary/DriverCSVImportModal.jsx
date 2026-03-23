import React, { useState } from 'react';
import Modal from '../../../components/Modal';
import { importOrganizationUsersFromCsv } from '../../../api/UserApi';

const TEMPLATE_BY_ROLE = {
    driver: [
        'first_name,last_name,email,username,password,phone_number',
        'Jamie,Lee,jamie.lee@example.com,,,8645551234',
        'Taylor,Rivera,taylor.rivera@example.com,taylor_rivera,TempPass1!,',
    ].join('\n'),
    sponsor: [
        'first_name,last_name,email,username,password,phone_number',
        'Morgan,Price,morgan.price@example.com,,,8645553210',
        'Alex,Jordan,alex.jordan@example.com,alex_jordan,TempPass1!,',
    ].join('\n'),
};

const statusStyles = {
    imported: { background: '#e8f5e9', color: '#1b5e20' },
    failed: { background: '#ffebee', color: '#b71c1c' },
};

function buildOnboardingUrl(onboardingPath) {
    if (!onboardingPath) return '';
    return `${window.location.origin}${onboardingPath}`;
}

const DriverCsvImportModal = ({ isOpen, onClose, orgId, requestingUserId, onImported }) => {
    const [fileName, setFileName] = useState('');
    const [csvText, setCsvText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [importResult, setImportResult] = useState(null);
    const [importRole, setImportRole] = useState('driver');
    const roleLabel = importRole === 'sponsor' ? 'Sponsor Users' : 'Drivers';
    const singularRoleLabel = importRole === 'sponsor' ? 'sponsor user' : 'driver';

    const resetState = () => {
        // Close/reset should clear the previous file and any old import results.
        setFileName('');
        setCsvText('');
        setIsSubmitting(false);
        setError('');
        setImportResult(null);
    };

    const handleRoleChange = (nextRole) => {
        setImportRole(nextRole);
        setFileName('');
        setCsvText('');
        setError('');
        setImportResult(null);
    };

    const handleClose = () => {
        resetState();
        setImportRole('driver');
        onClose();
    };

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];

        if (!file) {
            setFileName('');
            setCsvText('');
            setError('');
            return;
        }

        try {
            const text = await file.text();
            setFileName(file.name);
            setCsvText(text);
            setError('');
        } catch (fileError) {
            setFileName('');
            setCsvText('');
            setError('Unable to read that file. Please try another CSV.');
        }
    };

    const handleDownloadTemplate = () => {
        // Give sponsors/admins a ready-made header row that matches the backend aliases.
        const blob = new Blob([TEMPLATE_BY_ROLE[importRole] || TEMPLATE_BY_ROLE.driver], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${importRole}-import-template.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleImport = async () => {
        if (!csvText.trim()) {
            setError('Choose a CSV file before importing.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const result = await importOrganizationUsersFromCsv(orgId, requestingUserId, importRole, csvText);
            setImportResult(result);

            // Refresh the member list only when something was actually imported.
            if (result.importedCount > 0 && onImported) {
                await onImported();
            }
        } catch (importError) {
            setError(importError.message || 'Failed to import users.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            onSave={handleImport}
            title="Import Drivers/Sponsors From CSV"
            saveLabel={isSubmitting ? 'Importing...' : `Import ${roleLabel}`}
            saveDisabled={isSubmitting || !csvText.trim()}
            maxWidth="900px"
        >
            <div style={{ display: 'grid', gap: '16px' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <label style={{ fontWeight: 600, color: '#333' }}>Import Type</label>
                        <select
                            value={importRole}
                            onChange={(event) => handleRoleChange(event.target.value)}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cccccc' }}
                        >
                            <option value="driver">Drivers</option>
                            <option value="sponsor">Sponsor Users</option>
                        </select>
                    </div>
                    <p style={{ margin: 0, color: '#444', lineHeight: 1.5 }}>
                        Upload a CSV with <strong>first_name</strong>, <strong>last_name</strong>, and <strong>email</strong>.
                        You can also include <strong>username</strong>, <strong>password</strong>, and <strong>phone_number</strong>.
                        If username is blank, the app will generate one. If password is blank, the app will create a one-time setup link for each {singularRoleLabel}.
                    </p>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button type="button" onClick={handleDownloadTemplate}>
                            Download Template
                        </button>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#333' }}>
                            <span>Select CSV</span>
                            <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
                        </label>
                        <span style={{ color: '#666', fontSize: '14px' }}>
                            {fileName || 'No file selected'}
                        </span>
                    </div>
                </div>

                {error && (
                    <div style={{ background: '#ffebee', color: '#b71c1c', padding: '10px 12px', borderRadius: '8px' }}>
                        {error}
                    </div>
                )}

                {importResult && (
                    <div style={{ display: 'grid', gap: '12px' }}>
                        <div style={{ background: '#f6f8fa', border: '1px solid #e1e4e8', borderRadius: '8px', padding: '12px' }}>
                            <strong>{importResult.message}</strong>
                            <div style={{ marginTop: '6px', color: '#555', fontSize: '14px' }}>
                                {importResult.importedCount} imported, {importResult.failedCount} failed, {importResult.skippedCount} blank row(s) skipped.
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto', maxHeight: '360px', border: '1px solid #e5e5e5', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#f8f9fb' }}>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Row</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Status</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Name</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Email</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Username</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Setup Link</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importResult.results.map((result) => {
                                        const onboardingUrl = buildOnboardingUrl(result.onboardingPath);

                                        return (
                                        <tr key={`${result.rowNumber}-${result.email}-${result.status}`} style={{ borderTop: '1px solid #eeeeee' }}>
                                            <td style={{ padding: '10px', verticalAlign: 'top' }}>{result.rowNumber}</td>
                                            <td style={{ padding: '10px', verticalAlign: 'top' }}>
                                                <span
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '4px 8px',
                                                        borderRadius: '999px',
                                                        fontWeight: 600,
                                                        fontSize: '12px',
                                                        ...statusStyles[result.status],
                                                    }}
                                                >
                                                    {result.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px', verticalAlign: 'top' }}>
                                                {[result.firstName, result.lastName].filter(Boolean).join(' ')}
                                            </td>
                                            <td style={{ padding: '10px', verticalAlign: 'top' }}>{result.email || '-'}</td>
                                            <td style={{ padding: '10px', verticalAlign: 'top' }}>{result.username || '-'}</td>
                                            <td style={{ padding: '10px', verticalAlign: 'top', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                                {result.status !== 'imported'
                                                    ? '-'
                                                    : onboardingUrl
                                                        ? onboardingUrl
                                                        : 'Password provided in CSV'}
                                            </td>
                                            <td style={{ padding: '10px', verticalAlign: 'top', color: result.status === 'failed' ? '#b71c1c' : '#444' }}>
                                                {result.error || (onboardingUrl
                                                    ? `Share this setup link with the ${singularRoleLabel} so they can choose their password.`
                                                    : 'Imported with the password from the CSV.')}
                                            </td>
                                        </tr>
                                    )})}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default DriverCsvImportModal;
