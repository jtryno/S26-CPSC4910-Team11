import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import './App.css'
import About from './Pages/About'
import Login from './Pages/Login'

function Home() {
  const [count, setCount] = useState(0)

  return (
    <div className="home">
      <h1>Welcome to the Driver Incentive Program</h1>
    </div>
  )
}

function App() {
  return (
    <Router>
      <nav className="navbar">
        <div className="nav-brand">
          <Link to="/">Driver Incentive</Link>
        </div>
        <ul className="nav-links">
          <li><Link to="/">Home</Link></li>
          <li><Link to="/about">About</Link></li>
          <li><Link to="/login">Login</Link></li>
        </ul>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </Router>
  )
}

export default App