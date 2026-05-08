export const fmsSearchScopeOptions = [
  { value: 'ALL', label: 'All' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'CIF', label: 'CIF / Customer ID' },
  { value: 'IDENTITY', label: 'ID Proof' },
  { value: 'ACCOUNT', label: 'Account No' },
  { value: 'DOCUMENT_REF', label: 'Document Ref' },
  { value: 'CATEGORY', label: 'Category' },
  { value: 'DOCUMENT_TYPE', label: 'Doc Type' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'BRANCH', label: 'Branch' },
  { value: 'UPLOADER', label: 'Uploader' },
  { value: 'TAGS', label: 'Tags / Custom' },
  { value: 'FILE', label: 'File Name' }
];

const validScopes = new Set(fmsSearchScopeOptions.map((option) => option.value));

export const parseFmsSearchParams = (search = '') => {
  const params = new URLSearchParams(search);
  const q = String(params.get('q') || '').trim();
  const searchBy = String(params.get('search_by') || 'ALL').toUpperCase();

  return {
    q,
    search_by: validScopes.has(searchBy) ? searchBy : 'ALL'
  };
};

export const buildFmsSearchQuery = ({ q = '', search_by = 'ALL' } = {}) => {
  const params = new URLSearchParams();
  const nextQuery = String(q || '').trim();
  const nextScope = String(search_by || 'ALL').toUpperCase();

  if (nextQuery) {
    params.set('q', nextQuery);
  }

  if (validScopes.has(nextScope) && nextScope !== 'ALL') {
    params.set('search_by', nextScope);
  }

  return params.toString();
};
