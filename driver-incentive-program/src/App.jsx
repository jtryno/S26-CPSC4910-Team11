import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import './App.css'
import Home from './Pages/Home'
import About from './Pages/About'
import Login from './Pages/Login'
import PasswordReset from './Pages/PasswordReset'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

useEffect(() => {
    const checkAuth = async () => {
      const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
      if (storedUser) {
        setIsLoggedIn(true);
      }
      
      try {
        const response = await fetch('/api/session');
        const data = await response.json();
        
        if (data.loggedIn) {
          localStorage.setItem('user', JSON.stringify(data.user)); 
          setIsLoggedIn(true);
        } else { //cookie is expired
          localStorage.removeItem('user');
          sessionStorage.removeItem('user');
          setIsLoggedIn(false);
        }
      } catch (err) {
        console.error("session error", err);
      }
    };

    checkAuth();
    window.addEventListener('authStateChanged', checkAuth);
    
    return () => window.removeEventListener('authStateChanged', checkAuth);
  }, []);

  return (
    <Router>
      <nav className="navbar">
        <div className="nav-brand">
          <Link to="/">Driver Incentive</Link>
        </div>
        <ul className="nav-links">
          <li><Link to="/">Home</Link></li>
          <li><Link to="/about">About</Link></li>
        </ul>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/password-reset" element={<PasswordReset />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </Router>
  )
}

export default App