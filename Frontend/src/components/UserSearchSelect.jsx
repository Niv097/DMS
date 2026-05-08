import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';

const getRoleLabel = (user) => user?.role?.name || user?.role || '';

const formatUserMeta = (user) => {
  const employeeId = user?.employee_id ? `Employee ID ${user.employee_id}` : null;
  const branchName = user?.branch?.branch_name || user?.branch_name || null;
  return [employeeId, branchName].filter(Boolean).join(' | ');
};

const buildSearchText = (user) => [
  user?.name,
  user?.employee_id,
  user?.user_id,
  user?.email,
  getRoleLabel(user),
  user?.branch?.branch_name,
  user?.branch_name
].filter(Boolean).join(' ').toLowerCase();

const UserSearchSelect = ({
  id,
  value,
  onChange,
  options = [],
  placeholder = 'Search by name or employee ID',
  emptyLabel = 'No matching officer found.',
  disabled = false
}) => {
  const selectedUser = useMemo(
    () => options.find((option) => String(option.id) === String(value)) || null,
    [options, value]
  );
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!isFocused) {
      setQuery('');
    }
  }, [isFocused]);

  useEffect(() => {
    if (!selectedUser) {
      setIsEditing(true);
    } else if (!isFocused) {
      setIsEditing(false);
    }
  }, [selectedUser, isFocused]);

  const searchTerm = deferredQuery.trim().toLowerCase();
  const shouldShowResults = isEditing && isFocused && searchTerm.length >= 2;
  const filteredOptions = options
    .filter((option) => searchTerm && buildSearchText(option).includes(searchTerm))
    .slice(0, 8);

  const handleSelect = (option) => {
    onChange(String(option.id));
    setQuery('');
    setIsFocused(false);
    setIsEditing(false);
  };

  return (
    <div className="user-search-select">
      {selectedUser ? (
        <div className="user-search-selection">
          <div className="user-search-selection-header">
            <div className="user-search-selection-topline">Selected Officer</div>
            <button
              type="button"
              className="user-search-change-btn"
              onClick={() => setIsEditing((current) => !current)}
            >
              {isEditing ? 'Close Search' : 'Change Officer'}
            </button>
          </div>
          <div className="user-search-selection-body">
            <strong>{selectedUser.name}</strong>
            {getRoleLabel(selectedUser) ? <span className="user-search-role-pill">{getRoleLabel(selectedUser)}</span> : null}
          </div>
          <span>{formatUserMeta(selectedUser) || selectedUser.email || 'Workflow assignee'}</span>
        </div>
      ) : null}

      {(!selectedUser || isEditing) ? (
        <>
          <div className="user-search-field">
            <input
              id={id}
              type="text"
              className="user-search-input"
              value={query}
              placeholder={placeholder}
              disabled={disabled}
              autoComplete="off"
              onFocus={() => setIsFocused(true)}
              onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="user-search-hint">Search by officer name or employee ID.</div>
        </>
      ) : null}

      {shouldShowResults ? (
        <div className="user-search-results-panel">
          <div className="user-search-results-label">Matching Officers</div>
          {filteredOptions.length ? (
            <div className="user-search-results-list">
              {filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`user-search-option-card${selectedUser && String(selectedUser.id) === String(option.id) ? ' is-selected' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(option)}
                >
                  <div className="user-search-option-row">
                    <strong>{option.name}</strong>
                    {getRoleLabel(option) ? <span className="user-search-role-pill">{getRoleLabel(option)}</span> : null}
                  </div>
                  <span>{formatUserMeta(option) || option.email || 'Employee ID not available'}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="user-search-empty">{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default UserSearchSelect;
