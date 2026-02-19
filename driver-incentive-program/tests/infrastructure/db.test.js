import { describe, it, expect, beforeAll } from 'vitest';
import pool from '../../server/db.js'; // Ensure this path points correctly to your db.js

describe('Database Infrastructure Connection', () => {
  
  // 1. Check if the module is even loading correctly
  it('should initialize the connection pool', () => {
    expect(pool).toBeDefined();
    // Verify that the pool has the expected query method from mysql2
    expect(typeof pool.query).toBe('function');
  });

  // 2. Perform a "Heartbeat" test on the actual DB
  it('should successfully execute a simple heartbeat query (SELECT 1)', async () => {
    try {
      // We use a simple math query that doesn't depend on specific tables existing yet
      const [rows] = await pool.query('SELECT 1 + 1 AS result');
      
      expect(rows).toBeDefined();
      expect(rows[0].result).toBe(2);
      console.log('Database connection heartbeat successful.');
    } catch (error) {
      // If this fails, check your .env credentials or AWS Security Group rules
      console.error('Database connection failed:', error.message);
      throw error; 
    }
  });

  // 3. Verify access to specific project tables (Story 7115)
  it('should be able to reach the about_info table', async () => {
    try {
      const [rows] = await pool.query('SELECT COUNT(*) as count FROM about_info');
      expect(rows[0].count).toBeGreaterThanOrEqual(0);
      console.log(`Infrastructure Test: Found ${rows[0].count} records in about_info.`);
    } catch (error) {
      console.error('Table access failed. Ensure the ERD schema is applied to the DB.');
      throw error;
    }
  });

});