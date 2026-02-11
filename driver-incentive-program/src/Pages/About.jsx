import React, { useState, useEffect } from 'react';

const About = () => {
  const [data, setData] = useState({ 
    team_number: '', 
    version_number: '', 
    release_date: '', 
    product_name: '', 
    product_description: '' 
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5000/api/about')
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error("Fetch error:", err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#999999' }}>Loading project information...</div>;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ color: '#1a1a1a', marginBottom: '10px' }}>Project Information</h1>
      <p style={{ color: '#666666', marginBottom: '30px', fontSize: '1.05em' }}>Driver Incentive Program - Team 11</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
          <p style={{ color: '#999999', fontSize: '0.9em', margin: '0 0 8px 0', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Product Name</p>
          <p style={{ color: '#1a1a1a', fontSize: '1.1em', margin: '0', fontWeight: '600' }}>{data.product_name}</p>
        </div>
        
        <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
          <p style={{ color: '#999999', fontSize: '0.9em', margin: '0 0 8px 0', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Team Number</p>
          <p style={{ color: '#1a1a1a', fontSize: '1.1em', margin: '0', fontWeight: '600' }}>{data.team_number}</p>
        </div>

        <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
          <p style={{ color: '#999999', fontSize: '0.9em', margin: '0 0 8px 0', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Version</p>
          <p style={{ color: '#1a1a1a', fontSize: '1.1em', margin: '0', fontWeight: '600' }}>{data.version_number}</p>
        </div>

        <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
          <p style={{ color: '#999999', fontSize: '0.9em', margin: '0 0 8px 0', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Release Date</p>
          <p style={{ color: '#1a1a1a', fontSize: '1.1em', margin: '0', fontWeight: '600' }}>{new Date(data.release_date).toLocaleDateString()}</p>
        </div>
      </div>

      <div style={{ background: '#f0f7ff', padding: '30px', borderRadius: '8px', border: '1px solid #d0e3ff' }}>
        <h2 style={{ color: '#1a1a1a', marginTop: '0', marginBottom: '15px' }}>Product Description</h2>
        <p style={{ color: '#666666', lineHeight: '1.7', margin: '0', fontSize: '1.05em' }}>{data.product_description}</p>
      </div>
    </div>
  );
};

export default About;