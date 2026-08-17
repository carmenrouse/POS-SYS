// The internal schema every incoming supplier file/scan gets normalized to.
// Shared by header fuzzy-matching, coercion, validation, and the mapping UI.
const INTERNAL_FIELDS = [
  'sku',
  'name',
  'description',
  'quantity',
  'unitCost',
  'category',
];

const FIELD_LABELS = {
  sku: 'SKU',
  name: 'Product name',
  description: 'Description',
  quantity: 'Quantity',
  unitCost: 'Unit cost',
  category: 'Category',
};

const REQUIRED_FIELDS = ['sku', 'name', 'quantity', 'unitCost'];

module.exports = { INTERNAL_FIELDS, FIELD_LABELS, REQUIRED_FIELDS };
