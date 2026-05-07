import "./globals.css";
import "./houston.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { LoginGate } from "@/components/LoginGate";
import { isAuthed } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Vercel AI Chatbot with HoustonAI",
  description:
    "Vercel AI Chatbot wearing the HoustonAI face — multimodal chat with attachments and Thinking mode.",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Vercel AI Chatbot with HoustonAI",
    description:
      "Vercel AI Chatbot wearing the HoustonAI face — multimodal chat with attachments and Thinking mode.",
    images: ["/social.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authed = isAuthed();
  return (
    <html lang="zh-CN">
      <body>
        <Toaster
          position="top-center"
          richColors
          theme="dark"
          toastOptions={{
            style: {
              background: "#23262d",
              border: "1px solid #343841",
              color: "#fff",
            },
          }}
        />
        {authed ? children : <LoginGate />}
      </body>
    </html>
  );
}
