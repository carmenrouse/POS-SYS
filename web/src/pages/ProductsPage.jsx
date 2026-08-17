import React, { useEffect, useState } from 'react';

import client, { apiErrorMessage } from '../api/client';
import { Card, ErrorText } from '../components/ui';
import { formatMoney } from '../utils';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      client
        .get('/products', { params: search ? { search } : {} })
        .then(({ data }) => setProducts(data))
        .catch((err) => setError(apiErrorMessage(err)));
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div>
      <h1>Products</h1>
      <p className="help-text">
        This is a cached view of what's in your connected POS(es) — the POS itself remains the source of truth.
      </p>
      <ErrorText text={error} />
      <Card>
        <input
          className="input"
          placeholder="Search by name or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        {products.length === 0 ? (
          <p className="help-text">No products cached yet — they populate as imports are pushed to a POS.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>Cost</th>
                <th>Price</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.sku}</td>
                  <td>{p.name}</td>
                  <td>{p.category || '—'}</td>
                  <td>{formatMoney(p.cost)}</td>
                  <td>{formatMoney(p.price)}</td>
                  <td>{p.quantityOnHand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
