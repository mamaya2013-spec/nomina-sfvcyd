import React from "react";
import ResponsableDetailClient from "./ResponsableDetailClient";


interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResponsableDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ResponsableDetailClient id={id} />;
}
