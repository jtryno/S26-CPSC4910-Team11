
import React, { useEffect, useState } from "react";

const Catalog = () => {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const response = await fetch("/api/catalog");
        if (!response.ok) throw new Error("Failed to load catalog");
        const data = await response.json();
        setCatalog(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCatalog();
  }, []);

  if (loading) return <div className="catalog-page"><h1>Catalog</h1><p>Loading...</p></div>;
  if (error) return <div className="catalog-page"><h1>Catalog</h1><p>Error: {error}</p></div>;

  return (
    <div className="catalog-page">
      <h1>Catalog</h1>
      <ul className="catalog-list">
        {catalog.map((item) => (
          <li key={item.id} className="catalog-item">
            <img src={item.image} alt={item.title} style={{width: '100px', height: '100px', objectFit: 'contain', marginRight: '1rem'}} />
            <div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <span>Price: ${item.price}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Catalog;
