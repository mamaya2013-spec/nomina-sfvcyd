"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, AlertCircle } from "lucide-react";
import styles from "./file-dropzone.module.css";

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  title?: string;
  description?: string;
}

export default function FileDropzone({
  onFileSelect,
  accept = ".xlsx, .xls",
  title = "Arrastra tu archivo aquí",
  description = "Soporta formatos de Excel (.xlsx, .xls) hasta 10MB",
}: FileDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const validateFile = (file: File): boolean => {
    setError(null);
    
    // Check file extension
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls"].includes(extension || "")) {
      setError("Solo se permiten archivos de Excel (.xlsx, .xls)");
      return false;
    }

    // Check size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("El archivo supera el tamaño máximo permitido de 10MB");
      return false;
    }

    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={styles.container}>
      <div
        className={`${styles.dropzone} glass-panel ${
          isDragActive ? styles.dragActive : ""
        } ${selectedFile ? styles.hasFile : ""}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          className={styles.input}
          accept={accept}
          onChange={handleChange}
        />

        <div className={styles.content}>
          {selectedFile ? (
            <>
              <FileSpreadsheet className={styles.fileIcon} size={48} />
              <div className={styles.info}>
                <span className={styles.fileName}>{selectedFile.name}</span>
                <span className={styles.fileSize}>
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <button className={styles.clearButton} onClick={handleClear}>
                Quitar archivo
              </button>
            </>
          ) : (
            <>
              <UploadCloud className={styles.uploadIcon} size={48} />
              <div className={styles.textGroup}>
                <span className={styles.title}>{title}</span>
                <span className={styles.description}>{description}</span>
              </div>
              <button type="button" className={styles.browseButton}>
                Seleccionar Archivo
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className={styles.errorContainer}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
