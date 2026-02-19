import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Catalog from '../../src/Pages/Catalog'; // Adjust path if necessary

// Mock the global fetch API
global.fetch = vi.fn();

describe('Catalog Page UI Component', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading message initially', () => {
    // Return a promise that never resolves to stay in loading state
    fetch.mockReturnValue(new Promise(() => {}));
    
    render(<Catalog />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });

  it('renders catalog items when fetch is successful', async () => {
    const mockCatalogData = [
      {
        id: 1,
        title: 'Test Reward Item',
        description: 'A great reward for drivers',
        price: '10.00',
        image: 'https://via.placeholder.com/100'
      }
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCatalogData,
    });

    render(<Catalog />);

    // Wait for the title of our mock item to appear
    await waitFor(() => {
      expect(screen.getByText('Test Reward Item')).toBeInTheDocument();
    });

    // Verify other fields are rendered correctly
    expect(screen.getByText('A great reward for drivers')).toBeInTheDocument();
    expect(screen.getByText('Price: $10.00')).toBeInTheDocument();
    
    const img = screen.getByAltText('Test Reward Item');
    expect(img).toHaveAttribute('src', 'https://via.placeholder.com/100');
  });

  it('displays an error message when the API fetch fails', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
    });

    render(<Catalog />);

    await waitFor(() => {
      expect(screen.getByText(/Error: Failed to load catalog/i)).toBeInTheDocument();
    });
  });
});