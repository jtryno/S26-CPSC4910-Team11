import React, { useState } from 'react';
import Modal from '../../../components/Modal';
import { importUsersFromPipeFile } from '../../../api/UserApi';

const SAMPLE_ADMIN_FILE = [
    'O|New Organization',
    'D|New Organization|Joe|Driver|joe@email.com|100|Welcome bonus',
    'S|New Organization|Jill|Sponsor|jill@email.com',
    'D|Existing Organization|Tom|Smith|tom@email.com',
].join('\n');

const SAMPLE_SPONSOR_FILE = [
    'D||Joe|Driver|joe@email.com||',
    'S||Jill|Sponsor|jill@email.com',
    'D||Tom|Smith|tom@email.com|50|Referral bonus',
].join('\n');

const statusStyles = {
    imported: { background: '#e8f5e9', color: '#1b5e20' },
    failed: { background: '#ffebee', color: '#b71c1c' },
};

function buildOnboardingUrl(onboardingPath) {
    if (!onboardingPath) return '';
    return `${window.location.origin}${onboardingPath}`;
}

const BulkUploadModal = ({ isOpen, onClose, orgId, requestingUserId, onImported, userType }) => {
    const [fileName, setFileName] = useState('');
    const [fileText, setFileText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [importResult, setImportResult] = useState(null);

    const isAdmin = userType === 'admin';

    const resetState = () => {
        setFileName('');
        setFileText('');
        setIsSubmitting(false);
        setError('');
        setImportResult(null);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            setFileName('');
            setFileText('');
            setError('');
            return;
        }
        try {
            const text = await file.text();
            setFileName(file.name);
            setFileText(text);
            setError('');
        } catch (fileError) {
            setFileName('');
            setFileText('');
            setError('Unable to read that file. Please try another.');
        }
    };

    const handleDownloadTemplate = () => {
        const content = isAdmin ? SAMPLE_ADMIN_FILE : SAMPLE_SPONSOR_FILE;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'bulk-upload-template.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleImport = async () => {
        if (!fileText.trim()) {
            setError('Choose a file before importing.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const result = await importUsersFromPipeFile(orgId, requestingUserId, fileText);
            setImportResult(result);
            if (result.importedCount > 0 && onImported) {
                await onImported();
            }
        } catch (importError) {
            setError(importError.message || 'Failed to process bulk upload.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            onSave={handleImport}
            title="Bulk Upload Users"
            saveLabel={isSubmitting ? 'Uploading...' : 'Upload'}
            saveDisabled={isSubmitting || !fileText.trim()}
            maxWidth="1050px"
        >
            <div style={{ display: 'grid', gap: '16px' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                    <p style={{ margin: 0, color: '#444', lineHeight: 1.5 }}>
                        Upload a pipe-delimited (<strong>|</strong>) text file. Each line follows this format:
                    </p>
                    <code style={{ background: '#f6f8fa', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', display: 'block' }}>
                        {'<type>|organization name|first name|last name|email|points|reason'}
                    </code>
                    <div style={{ fontSize: '13px', color: '#555', lineHeight: 1.6 }}>
                        <strong>Types:</strong>{' '}
                        {isAdmin && <span><strong>O</strong> = Create Organization, </span>}
                        <strong>D</strong> = Driver, <strong>S</strong> = Sponsor
                        <br />
                        {!isAdmin && (
                            <span>Organization name should be left empty (uses your organization).
                            <br /></span>
                        )}
                        <strong>Points</strong> and <strong>reason</strong> are optional. If points are provided, a reason is required.
                        {isAdmin && (
                            <span>
                                <br />Organizations must be created (via an <strong>O</strong> line) or already exist before adding users to them.
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button type="button" onClick={handleDownloadTemplate}>
                            Download Template
                        </button>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#333' }}>
                            <span>Select File</span>
                            <input type="file" accept=".txt,.csv,text/plain" onChange={handleFileChange} />
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
                                {importResult.importedCount} imported, {importResult.failedCount} failed.
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto', maxHeight: '400px', border: '1px solid #e5e5e5', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#f8f9fb' }}>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Line</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Status</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Type</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Org</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Name</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Email</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Username</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Points</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Setup Link</th>
                                        <th style={{ textAlign: 'left', padding: '10px' }}>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importResult.results.map((result) => {
                                        const onboardingUrl = buildOnboardingUrl(result.onboardingPath);
                                        const warningText = (result.warnings || []).join(' ');
                                        const detailText = result.error || result.message || '';
                                        const fullDetail = [detailText, warningText].filter(Boolean).join(' ');

                                        return (
                                            <tr key={`${result.lineNumber}-${result.email || result.orgName}-${result.status}`} style={{ borderTop: '1px solid #eeeeee' }}>
                                                <td style={{ padding: '10px', verticalAlign: 'top' }}>{result.lineNumber}</td>
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
                                                <td style={{ padding: '10px', verticalAlign: 'top' }}>{result.type || '-'}</td>
                                                <td style={{ padding: '10px', verticalAlign: 'top' }}>{result.orgName || '-'}</td>
                                                <td style={{ padding: '10px', verticalAlign: 'top' }}>
                                                    {[result.firstName, result.lastName].filter(Boolean).join(' ') || '-'}
                                                </td>
                                                <td style={{ padding: '10px', verticalAlign: 'top' }}>{result.email || '-'}</td>
                                                <td style={{ padding: '10px', verticalAlign: 'top' }}>{result.username || '-'}</td>
                                                <td style={{ padding: '10px', verticalAlign: 'top' }}>
                                                    {result.pointsAdded != null ? result.pointsAdded : '-'}
                                                </td>
                                                <td style={{ padding: '10px', verticalAlign: 'top', fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '12px' }}>
                                                    {result.type === 'O'
                                                        ? '-'
                                                        : result.status !== 'imported'
                                                            ? '-'
                                                            : onboardingUrl || 'N/A'}
                                                </td>
                                                <td style={{ padding: '10px', verticalAlign: 'top', color: result.status === 'failed' ? '#b71c1c' : warningText ? '#e65100' : '#444' }}>
                                                    {fullDetail || '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default BulkUploadModal;
