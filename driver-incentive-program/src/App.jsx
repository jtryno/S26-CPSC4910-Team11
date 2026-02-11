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
    // Check if user is logged in
    const checkLoginStatus = () => {
      const user = localStorage.getItem('user') || sessionStorage.getItem('user');
      setIsLoggedIn(!!user);
    };

    checkLoginStatus();

    // Listen for changes to storage (from other tabs/windows)
    window.addEventListener('storage', checkLoginStatus);
    
    // Listen for custom auth state change event (same tab login/logout)
    window.addEventListener('authStateChanged', checkLoginStatus);
    
    return () => {
      window.removeEventListener('storage', checkLoginStatus);
      window.removeEventListener('authStateChanged', checkLoginStatus);
    };
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
          {!isLoggedIn && <li><Link to="/login">Login</Link></li>}
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