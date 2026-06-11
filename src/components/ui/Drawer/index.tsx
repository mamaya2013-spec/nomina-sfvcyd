"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./drawer.module.css";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export default function Drawer({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: DrawerProps) {
  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const sizeClass = styles[size] || styles.md;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer Content */}
          <motion.div
            className={`${styles.drawer} ${sizeClass}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div className={styles.header}>
              <h2 className={styles.title}>{title}</h2>
              <button onClick={onClose} className={styles.closeButton} aria-label="Cerrar panel">
                <X size={20} />
              </button>
            </div>
            <div className={styles.body}>{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
