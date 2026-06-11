"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import styles from "./searchable-select.module.css";

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  label?: string;
  className?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar opción...",
  disabled = false,
  error,
  label,
  className = "",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options based on search search
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm("");
    }
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div className={`${styles.container} ${className}`} ref={containerRef}>
      {label && <label className={styles.label}>{label}</label>}
      
      <div
        className={`${styles.selectTrigger} ${isOpen ? styles.active : ""} ${
          error ? styles.errorBorder : ""
        } ${disabled ? styles.disabled : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={selectedOption ? styles.selectedValue : styles.placeholder}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        
        <div className={styles.actions}>
          {selectedOption && !disabled && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={handleClear}
              title="Limpiar selección"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} className={`${styles.chevron} ${isOpen ? styles.open : ""}`} />
        </div>
      </div>

      {isOpen && (
        <div className={`${styles.dropdown} glass-panel`}>
          <div className={styles.searchWrapper}>
            <Search size={14} className={styles.searchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              className={styles.searchInput}
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <ul className={styles.optionsList}>
            {filteredOptions.length === 0 ? (
              <li className={styles.noOptions}>No se encontraron resultados</li>
            ) : (
              filteredOptions.map((opt) => (
                <li
                  key={opt.value}
                  className={`${styles.option} ${opt.value === value ? styles.selected : ""}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {error && <span className={styles.errorMessage}>{error}</span>}
    </div>
  );
}
