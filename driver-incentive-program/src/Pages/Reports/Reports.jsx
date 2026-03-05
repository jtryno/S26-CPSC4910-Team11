import React from 'react';
import { useParams } from 'react-router-dom';
import SponsorReport from './SponsorReport/SponsorReport';


const Reports = () => {
    const { user_type } = useParams();

    return (
        <div>
            <h1>{user_type.charAt(0).toUpperCase() + user_type.slice(1)} Report</h1>
            {user_type === 'admin' && 
                <p>Here you can view admin reports.</p>
            }
            {user_type === 'sponsor' && 
                <SponsorReport />
            }
        </div>
    );
}

export default Reports;