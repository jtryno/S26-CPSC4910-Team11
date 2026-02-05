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

  if (loading) return <div style={{ padding: '20px' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>Project Information</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        <div>
          <p><strong>Product Name:</strong> {data.product_name}</p>
          <p><strong>Team Number:</strong> {data.team_number}</p>
        </div>
        <div>
          <p><strong>Version:</strong> {data.version_number}</p>
          <p><strong>Release Date:</strong> {new Date(data.release_date).toLocaleDateString()}</p>
        </div>
      </div>

      <div style={{ marginTop: '20px', padding: '15px', background: '#141212', borderRadius: '8px' }}>
        <h4>Product Description</h4>
        <p style={{ lineHeight: '1.6' }}>{data.product_description}</p>
      </div>
    </div>
  );
};

export default About;