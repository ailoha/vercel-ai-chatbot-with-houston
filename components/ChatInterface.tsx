/* eslint-disable @next/next/no-img-element */
"use client";

import { useChat } from "ai/react";
import type { Message } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import {
  DragEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import Houston, { HoustonHandle } from "@/components/Houston";
import { HoustonAILogo } from "@/components/HoustonAI";
import { Notice } from "@/components/Notice";
import {
  AstroIcon,
  AttachmentIcon,
  GithubIcon,
  SendIcon,
  SparklesIcon,
  StopIcon,
} from "@/components/icons";
import { acceptFiles, getTextFromDataUrl } from "@/lib/attachments";

function TextFilePreview({ file }: { file: File }) {
  const [content, setContent] = useState<string>("");
  useEffect(() => {
    const reader = new FileReader();
    let cancelled = false;
    reader.onload = (e) => {
      if (cancelled) return;
      const text = e.target?.result;
      setContent(typeof text === "string" ? text.slice(0, 100) : "");
    };
    reader.readAsText(file);
    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [file]);
  return (
    <div>
      {content}
      {content.length >= 100 && "..."}
    </div>
  );
}

// One text-attachment block: decode base64 once per unique data URL.
const TextAttachmentBlock = memo(function TextAttachmentBlock({
  url,
}: {
  url: string;
}) {
  const text = useMemo(() => getTextFromDataUrl(url), [url]);
  return <div className="attachment-text">{text}</div>;
});

// One chat bubble. Memoized so streaming a token only re-renders the
// last (assistant) message — prior turns keep their React subtree
// untouched, which is the difference between O(N) markdown re-parses
// per token and O(1).
type MessageItemProps = { message: Message };
const MessageItem = memo(function MessageItem({ message }: MessageItemProps) {
  return (
    <li
      className="message"
      data-user={message.role === "user" ? "" : undefined}
    >
      <div className="message-body">
        {message.parts && message.parts.length > 0 ? (
          message.parts.map((part, i) => {
            if (part.type === "reasoning") {
              return (
                <div key={i} className="reasoning-block">
                  <div className="reasoning-label">
                    <SparklesIcon />
                    <span>思考过程</span>
                  </div>
                  <Streamdown>{part.reasoning}</Streamdown>
                </div>
              );
            }
            if (part.type === "text") {
              return <Streamdown key={i}>{part.text}</Streamdown>;
            }
            return null;
          })
        ) : (
          <Streamdown>{message.content}</Streamdown>
        )}
      </div>

      {message.experimental_attachments &&
        message.experimental_attachments.length > 0 && (
          <div className="attachments">
            {message.experimental_attachments.map((attachment) => {
              if (attachment.contentType?.startsWith("image")) {
                return (
                  <img
                    className="attachment-image"
                    key={attachment.name}
                    src={attachment.url}
                    alt={attachment.name ?? "attachment"}
                  />
                );
              }
              if (attachment.contentType?.startsWith("text")) {
                return (
                  <TextAttachmentBlock
                    key={attachment.name}
                    url={attachment.url}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
    </li>
  );
});

export function ChatInterface() {
  const houstonRef = useRef<HoustonHandle | null>(null);
  const messagesEndRef = useRef<HTMLLIElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // True while the user is at (or near) the bottom of the chat. We only
  // auto-scroll when this is true — otherwise the user is reading
  // history and we must not yank them back.
  const stickToBottomRef = useRef(true);

  const [files, setFiles] = useState<FileList | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);

  const {
    messages,
    setMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
  } = useChat({
    onError: (error) => {
      houstonRef.current?.setConnectionState("error");
      const raw = (error?.message ?? "").trim();
      const isMasked =
        raw.length === 0 ||
        raw === "An error occurred." ||
        raw === "An error occurred";
      toast.error(isMasked ? "请求失败，请稍后重试" : `请求失败：${raw}`);

      // Drop the just-failed user turn so the same poisoned message
      // (e.g. an attachment a non-VLM model rejects) is not re-sent on
      // every subsequent submit. Restore its text so the user can edit
      // and retry without retyping. Attachments are intentionally not
      // re-attached because they are what the upstream rejected.
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role !== "user") return prev;
        const restored =
          typeof last.content === "string" && last.content.length > 0
            ? last.content
            : last.parts
                ?.filter(
                  (p): p is { type: "text"; text: string } =>
                    p.type === "text"
                )
                .map((p) => p.text)
                .join("") ?? "";
        if (restored) setInput(restored);
        return prev.slice(0, -1);
      });
    },
    onResponse: () => {
      houstonRef.current?.setConnectionState("streaming");
    },
    onFinish: () => {
      houstonRef.current?.setConnectionState("done");
    },
  });

  const hasMessages = messages.length > 0;

  // Track Houston state alongside loading transitions
  useEffect(() => {
    if (isLoading) {
      const h = houstonRef.current;
      if (!h) return;
      const cur = h.getConnectionState();
      if (cur !== "streaming" && cur !== "connecting") {
        h.setConnectionState("connecting");
      }
    }
  }, [isLoading]);

  // Keep the "am I at the bottom?" flag fresh as the user scrolls.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = dist < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll, but only if the user is sitting at the bottom. Use
  // instant scroll instead of smooth so rapid streaming tokens don't
  // stack overlapping animations.
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages]);

  // Object URLs for the staged attachment preview. Created once per
  // file batch, revoked when the batch changes or the component
  // unmounts — fixes the per-keystroke leak that happens if you call
  // URL.createObjectURL inline inside JSX.
  const previewUrls = useMemo(() => {
    if (!files) return [] as { file: File; url: string | null }[];
    return Array.from(files).map((file) => ({
      file,
      url: file.type.startsWith("image") ? URL.createObjectURL(file) : null,
    }));
  }, [files]);
  useEffect(() => {
    return () => {
      previewUrls.forEach(({ url }) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

  // The single accept pipeline used by paste / drop / file picker.
  // Does type, count, size, and total-size validation, plus image
  // downscaling. Rejected files surface in a single toast with their
  // individual reasons; accepted files replace the staged batch.
  const acceptAndStage = useCallback(async (raw: File[]) => {
    if (raw.length === 0) return;
    const { ok, rejected } = await acceptFiles(raw);
    if (rejected.length > 0) {
      const detail = rejected
        .map((r) => `${r.name}（${r.reason}）`)
        .join("；");
      toast.error(`部分文件未添加：${detail}`);
    }
    if (ok.length === 0) return;
    const dt = new DataTransfer();
    ok.forEach((f) => dt.items.add(f));
    setFiles(dt.files);
  }, []);

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const pasted = Array.from(items)
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (pasted.length === 0) return;
    void acceptAndStage(pasted);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) void acceptAndStage(dropped);
    setIsDragging(false);
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sel = event.target.files;
    if (sel && sel.length > 0) {
      void acceptAndStage(Array.from(sel));
    }
    // Reset so the same file can be picked again after removal.
    event.target.value = "";
  };

  const onFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!input.trim() && (!files || files.length === 0)) {
      event.preventDefault();
      return;
    }
    // The user just hit send — they expect to see their own message
    // and the streaming reply. Force-reattach to the bottom regardless
    // of where they were scrolled.
    stickToBottomRef.current = true;
    houstonRef.current?.setConnectionState("connecting");
    handleSubmit(event, {
      body: { thinking: thinkingEnabled },
      ...(files ? { experimental_attachments: files } : {}),
    });
    setFiles(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMobile =
      typeof navigator !== "undefined" &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    if (isMobile) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const onStop = () => {
    stop();
    houstonRef.current?.setConnectionState("interrupted");
    setTimeout(() => {
      if (houstonRef.current?.getConnectionState() === "interrupted") {
        houstonRef.current?.setConnectionState("idle");
      }
    }, 1500);
  };

  return (
    <div
      className="houston-page"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <a
        className="houston-corner houston-corner-left"
        href="https://astro.build"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Astro"
      >
        <AstroIcon />
      </a>
      <a
        className="houston-corner houston-corner-right"
        href="https://github.com/ailoha/vercel-ai-chatbot-with-houston"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub"
      >
        <GithubIcon />
      </a>

      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="houston-drop-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div>将文件拖放到这里</div>
            <div className="houston-drop-sub">（仅支持图片和文本）</div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className={`houston-header${hasMessages ? " inactive" : ""}`}>
        <Houston ref={houstonRef} glow />
        <div className="intro">
          <div className="intro-content">
            <p className="intro-title">
              <HoustonAILogo />
            </p>
            <p className="intro-subtitle">
              Hi, I&apos;m Houston, your AI assistant.
              <br />
              Feel free to ask me anything, I&apos;ll do my best to answer!
            </p>
          </div>
        </div>
      </header>

      <main className="houston-main" ref={mainRef}>
        <ul className="chat">
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}

          {isLoading &&
            messages[messages.length - 1]?.role !== "assistant" && (
              <li className="message message-thinking">
                <em>嗯……</em>
              </li>
            )}

          <li ref={messagesEndRef} className="chat-end" aria-hidden="true" />
        </ul>
      </main>

      <div className="houston-notice-wrap">
        <Notice />
      </div>

      <footer className="houston-footer">
        <form className="messageForm" onSubmit={onFormSubmit}>
          <AnimatePresence>
            {files && files.length > 0 && (
              <div className="attachment-preview">
                {previewUrls.map(({ file, url }) =>
                  url ? (
                    <motion.img
                      key={file.name}
                      src={url}
                      alt={file.name}
                      className="attachment-preview-image"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{
                        y: -10,
                        scale: 1.1,
                        opacity: 0,
                        transition: { duration: 0.2 },
                      }}
                    />
                  ) : file.type.startsWith("text") ? (
                    <motion.div
                      key={file.name}
                      className="attachment-preview-text"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{
                        y: -10,
                        scale: 1.1,
                        opacity: 0,
                        transition: { duration: 0.2 },
                      }}
                    >
                      <TextFilePreview file={file} />
                    </motion.div>
                  ) : null
                )}
              </div>
            )}
          </AnimatePresence>

          <input
            type="file"
            multiple
            accept="image/*,text/*"
            ref={fileInputRef}
            className="hidden-file-input"
            onChange={handleFileChange}
          />

          <div className="autogrow" data-value={input}>
            <textarea
              id="message"
              name="message"
              value={input}
              placeholder="Enter something..."
              cols={30}
              onChange={handleInputChange}
              onPaste={handlePaste}
              onKeyDown={onKeyDown}
            />

            <div className="input-tools">
              <button
                type="button"
                onClick={handleUploadClick}
                className="input-tool-btn"
                aria-label="上传文件"
                title="上传图片或文本"
              >
                <AttachmentIcon />
              </button>
              <button
                type="button"
                onClick={() => setThinkingEnabled((v) => !v)}
                className={`thinking-toggle${thinkingEnabled ? " active" : ""}`}
                aria-pressed={thinkingEnabled}
                aria-label="深度思考"
                title="深度思考（仅推理模型生效）"
              >
                <SparklesIcon />
                <span>思考</span>
              </button>
            </div>

            {!isLoading ? (
              <button
                type="submit"
                id="submitBtn"
                aria-label="发送"
                disabled={!input.trim() && (!files || files.length === 0)}
              >
                <SendIcon />
              </button>
            ) : (
              <button
                type="button"
                id="stopBtn"
                className="stop-btn"
                aria-label="停止"
                onClick={onStop}
              >
                <StopIcon />
              </button>
            )}
          </div>
        </form>
        <span className="disclaimer">
          AI can make mistakes. Consider checking important information.
        </span>
      </footer>
    </div>
  );
}
