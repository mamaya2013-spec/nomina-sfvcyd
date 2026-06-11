import React from "react";
import MonotributistaDetailClient from "./MonotributistaDetailClient";

export const runtime = 'edge';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MonotributistaDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <MonotributistaDetailClient id={id} />;
}
