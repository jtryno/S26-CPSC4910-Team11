import { useState, useEffect, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import './App.css'
import Home from './Pages/Home'
import About from './Pages/About'
import Login from './Pages/Login'
import Account from './Pages/Account'
import PasswordReset from './Pages/PasswordReset'
import Dashboard from './Pages/Dashboard'
import Organizations from './Pages/Organization/Organizations/Organizations';
import OrganizationSummary from './Pages/Organization/OrganizationSummary/OrganizationSummary';
import Catalog from './Pages/Catalog'
import InactivityModal from './components/InactivityModal'
import { FaUser } from 'react-icons/fa';

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState(null);
  const [orgName, setOrgName] = useState(null);
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // refs for timer IDs
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);

  // inactivity timeout constants (add 60 inbetween the first and last numbers for real value)
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 * 60 * 1000 minutes real value (testing 30 seconds)
  const WARNING_TIME = 28 * 60 * 1000; // 28 minutes, with 2 mins to answer log in or log out once warning pops up
  // (real value 28 * 60 * 1000 = 28 minutes, testing value 10 seconds of pop up)

useEffect(() => {
    const checkAuth = async () => {
      const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');

      // first check local storage
      if (storedUser) {
        const user = JSON.parse(storedUser);
        setIsLoggedIn(true);
        setUserData(user);
        
        //get org name from sponsor org table if driver has a sponsor_org_id
        if (user.sponsor_org_id) {
          try {
            const orgRes = await fetch(`/api/organization/${user.sponsor_org_id}`);
            const orgData = await orgRes.json();
            if (orgData.organization?.name) {
              setOrgName(orgData.organization.name);
            }
          } catch (err) {
            console.error("Failed to fetch org name:", err);
          }
        } else {
          setOrgName(null);
        }
      } else {
        setIsLoggedIn(false);
        setUserData(null);
        setOrgName(null);
        setUserData(JSON.parse(storedUser));
      }

      // check if there is valid cookie session
      try {
        const response = await fetch('/api/session');
        const data = await response.json();

        if (data.loggedIn) {
          // Cookie is valid, update localStorage with user data
          localStorage.setItem('user', JSON.stringify(data.user));
          setIsLoggedIn(true);
          setUserData(data.user);
          
          if (data.user.sponsor_org_id) {
            try {
              const orgRes = await fetch(`/api/organization/${data.user.sponsor_org_id}`);
              const orgData = await orgRes.json();
              if (orgData.organization?.name) {
                setOrgName(orgData.organization.name);
              }
            } catch (err) {
              console.error("Failed to fetch org name:", err);
            }
          }
        } else if (!storedUser) {
          setIsLoggedIn(false);
          setUserData(null);
          setOrgName(null);
        }
      } catch (err) {
        console.error("session error", err);
        if (storedUser) {
          setIsLoggedIn(true);
          setUserData(JSON.parse(storedUser));
        }
      }
    };

    checkAuth();
    window.addEventListener('authStateChanged', checkAuth);

    return () => window.removeEventListener('authStateChanged', checkAuth);
  }, []);

  // initialize or clear inactivity timers based on login state
  useEffect(() => {
    if (isLoggedIn) {
      // checks if page refresh needs to be handled
      // always use localStorage for lastActivityTime (for cross tab sync))
      const lastActivity = localStorage.getItem('lastActivityTime');

      if (lastActivity) {
        const elapsed = Date.now() - parseInt(lastActivity);

        if (elapsed >= INACTIVITY_TIMEOUT) {
          // autologout immediately
          handleInactivityLogout();
        } else if (elapsed >= WARNING_TIME) {
          // show modal immediately and set logout timer for remaining time
          setShowInactivityModal(true);
          const remaining = INACTIVITY_TIMEOUT - elapsed;
          logoutTimerRef.current = setTimeout(handleInactivityLogout, remaining);
        } else {
          // set timers for remaining time
          const warningRemaining = WARNING_TIME - elapsed;
          const logoutRemaining = INACTIVITY_TIMEOUT - elapsed;
          warningTimerRef.current = setTimeout(() => setShowInactivityModal(true), warningRemaining);
          logoutTimerRef.current = setTimeout(handleInactivityLogout, logoutRemaining);
        }
      } else {
        // first login, initialize timer
        resetInactivityTimer();
      }
    } else {
      // user logged out, clear all timers
      clearInactivityTimers();
      setShowInactivityModal(false);
    }

    // clean
    return () => clearInactivityTimers();
  }, [isLoggedIn]);

  // reset timer on navigation use(route change)
  useEffect(() => {
    if (isLoggedIn) {
      resetInactivityTimer();
    }
  }, [location]);

  // listen for custom userActivity events
  useEffect(() => {
    const handleUserActivity = () => {
      if (isLoggedIn) {
        resetInactivityTimer();
      }
    };

    window.addEventListener('userActivity', handleUserActivity);
    return () => window.removeEventListener('userActivity', handleUserActivity);
  }, [isLoggedIn]);

  // cross tab synchronization (listen for storage changes in other tab(s)
  useEffect(() => {
    const handleStorageChange = (e) => {
      // storage event fires when localStorage/sessionStorage is modified in another tab

      // if logout signal was sent from another tab, log out this tab too
      if (e.key === 'logout') {
        clearInactivityTimers();
        setShowInactivityModal(false);
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('lastActivityTime');
        setIsLoggedIn(false);
        navigate('/');
        return;
      }

      if (e.key === 'lastActivityTime' && isLoggedIn) {
        const lastActivity = e.newValue;
        if (lastActivity) {
          const elapsed = Date.now() - parseInt(lastActivity);

          // syncs timers with updated activity time
          clearInactivityTimers();
          const warningRemaining = WARNING_TIME - elapsed;
          const logoutRemaining = INACTIVITY_TIMEOUT - elapsed;

          if (elapsed >= INACTIVITY_TIMEOUT) {
            handleInactivityLogout();
          } else if (elapsed >= WARNING_TIME) {
            setShowInactivityModal(true);
            logoutTimerRef.current = setTimeout(handleInactivityLogout, logoutRemaining);
          } else {
            setShowInactivityModal(false);
            warningTimerRef.current = setTimeout(() => setShowInactivityModal(true), warningRemaining);
            logoutTimerRef.current = setTimeout(handleInactivityLogout, logoutRemaining);
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [isLoggedIn]);

  // cross tab synchronization (checks timer when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isLoggedIn) {
        // check if should be logged out based on stored timestamp
        // always use localStorage for lastActivityTime (for crosstab sync)
        const lastActivity = localStorage.getItem('lastActivityTime');
        if (lastActivity) {
          const elapsed = Date.now() - parseInt(lastActivity);
          if (elapsed >= INACTIVITY_TIMEOUT) {
            handleInactivityLogout();
          } else {
            // Reset timers to sync with other tabs
            clearInactivityTimers();
            const warningRemaining = WARNING_TIME - elapsed;
            const logoutRemaining = INACTIVITY_TIMEOUT - elapsed;

            if (elapsed >= WARNING_TIME) {
              setShowInactivityModal(true);
              logoutTimerRef.current = setTimeout(handleInactivityLogout, logoutRemaining);
            } else {
              setShowInactivityModal(false);
              warningTimerRef.current = setTimeout(() => setShowInactivityModal(true), warningRemaining);
              logoutTimerRef.current = setTimeout(handleInactivityLogout, logoutRemaining);
            }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isLoggedIn]);

  // show resetInactivityTimer globally for components to call
  useEffect(() => {
    window.resetInactivityTimer = resetInactivityTimer;
    return () => {
      delete window.resetInactivityTimer;
    };
  }, [isLoggedIn]);

  // clears all inactivity timers
  const clearInactivityTimers = () => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  };

  // Reset inactivity timer (called on user activity like route change on navigation)
  const resetInactivityTimer = () => {
    clearInactivityTimers();
    const now = Date.now();

    localStorage.setItem('lastActivityTime', now.toString());

    // set warning timer
    warningTimerRef.current = setTimeout(() => {
      setShowInactivityModal(true);
    }, WARNING_TIME);

    // set logout timer
    logoutTimerRef.current = setTimeout(() => {
      handleInactivityLogout();
    }, INACTIVITY_TIMEOUT);
  };

  // Handle automatic logout due to inactivity
  const handleInactivityLogout = () => {
    clearInactivityTimers();
    setShowInactivityModal(false);
    handleLogout();
  };

  // handle Stay Logged In button click
  const handleStayLoggedIn = () => {
    setShowInactivityModal(false);
    resetInactivityTimer();
  };

  // handle Logout Now button click
  const handleLogoutNow = () => {
    setShowInactivityModal(false);
    handleLogout();
  };

  const handleLogout = async () => {
    try {
      // clear inactivity timers
      clearInactivityTimers();

      // backend to clear cookie
      await fetch('/api/logout', { method: 'POST' });

      // clear local storage
      localStorage.removeItem('user');
      sessionStorage.removeItem('user');
      localStorage.removeItem('lastActivityTime');
      sessionStorage.removeItem('lastActivityTime');

      // signal other tabs to logout (writes to localStorage so storage event fires)
      localStorage.setItem('logout', Date.now().toString());
      localStorage.removeItem('logout');

      // notify app of auth state change
      window.dispatchEvent(new Event('authStateChanged'));

      // Update state
      setIsLoggedIn(false);

      // redirects to homepage
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local state even if backend call fails
      clearInactivityTimers();
      localStorage.removeItem('user');
      sessionStorage.removeItem('user');
      localStorage.removeItem('lastActivityTime');
      sessionStorage.removeItem('lastActivityTime');
      localStorage.setItem('logout', Date.now().toString());
      localStorage.removeItem('logout');
      setIsLoggedIn(false);

      // redirects to homepage
      navigate('/');
    }
  };

  return (
    <>
      <nav className="navbar">
        <div className="nav-brand">
          <Link to="/">Driver Incentive</Link>
        </div>
        <div className="nav-center">
          <ul className="nav-links">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/about">About</Link></li>
            {isLoggedIn && <li><Link to="/organization">Organizations</Link></li>}
            {isLoggedIn && (
              <>
                <li><Link to="/dashboard">Dashboard</Link></li>
                <li><Link to="/catalog">Catalog</Link></li>
              </>
            )}
          </ul>
        </div>
        <ul className="nav-auth">
          {!isLoggedIn && <li><Link to="/login">Login</Link></li>}
          {isLoggedIn && (
            <div style={{display: 'flex', alignItems: 'center', gap: '20px'}}>
              <Link to="/account" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                <FaUser size={20} />
                <span className="nav-username">
                  {userData?.username || 'User'}
                  {orgName && <span style={{ color: '#2f2f2f', fontWeight: '400' }}> • {orgName}</span>}
                </span>
              </Link>
              <li>
                <a href="#" onClick={(e) => {
                  e.preventDefault();
                  handleLogout();
                }} style={{ cursor: 'pointer' }}>
                  Logout
                </a>
              </li>
            </div>
          )}
        </ul>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/password-reset" element={<PasswordReset />} />
          <Route path="/login" element={<Login />} />
          <Route path="/account" element={<Account />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/organization" element={<Organizations />} />
          <Route path="/organization/:orgId" element={<OrganizationSummary />} />
          <Route path="/catalog" element={<Catalog />} />
        </Routes>
      </main>

      <InactivityModal
        isOpen={showInactivityModal}
        onStayLoggedIn={handleStayLoggedIn}
        onLogoutNow={handleLogoutNow}
      />
    </>
  )
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App