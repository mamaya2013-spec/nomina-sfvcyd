import React from "react";
import BecarioDetailClient from "./BecarioDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BecarioDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <BecarioDetailClient id={id} />;
}
