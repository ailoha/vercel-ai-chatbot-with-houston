/* eslint-disable @next/next/no-img-element */
"use client";

import { useChat } from "ai/react";
import { AnimatePresence, motion } from "framer-motion";
import { DragEvent, useEffect, useRef, useState } from "react";
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

const getTextFromDataUrl = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1];
  return window.atob(base64);
};

function TextFilePreview({ file }: { file: File }) {
  const [content, setContent] = useState<string>("");
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      setContent(typeof text === "string" ? text.slice(0, 100) : "");
    };
    reader.readAsText(file);
  }, [file]);
  return (
    <div>
      {content}
      {content.length >= 100 && "..."}
    </div>
  );
}

export function ChatInterface() {
  const previousResponseIdRef = useRef<string | null>(null);
  const houstonRef = useRef<HoustonHandle | null>(null);
  const messagesEndRef = useRef<HTMLLIElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<FileList | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
  } = useChat({
    experimental_prepareRequestBody: ({ messages, requestBody }) => ({
      messages: previousResponseIdRef.current
        ? messages.slice(-1)
        : messages,
      ...((requestBody ?? {}) as Record<string, unknown>),
    }),
    onError: () => {
      houstonRef.current?.setConnectionState("error");
      toast.error("请求过于频繁，请稍后再试！");
    },
    onResponse: () => {
      houstonRef.current?.setConnectionState("streaming");
    },
    onFinish: (message) => {
      const annotations = message.annotations as
        | Array<{ responseId?: string } | null | undefined>
        | undefined;
      const responseId = annotations
        ?.map((a) => a?.responseId)
        .find((id): id is string => typeof id === "string" && id.length > 0);
      if (responseId) {
        previousResponseIdRef.current = responseId;
      }
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const pastedFiles = Array.from(items)
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (pastedFiles.length === 0) return;
    const validFiles = pastedFiles.filter(
      (file) =>
        file.type.startsWith("image/") || file.type.startsWith("text/")
    );
    if (validFiles.length === pastedFiles.length) {
      const dataTransfer = new DataTransfer();
      validFiles.forEach((file) => dataTransfer.items.add(file));
      setFiles(dataTransfer.files);
    } else {
      toast.error("仅支持图片和文本文件");
    }
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
    const droppedFiles = event.dataTransfer.files;
    const droppedFilesArray = Array.from(droppedFiles);
    if (droppedFilesArray.length > 0) {
      const validFiles = droppedFilesArray.filter(
        (file) =>
          file.type.startsWith("image/") || file.type.startsWith("text/")
      );
      if (validFiles.length === droppedFilesArray.length) {
        const dataTransfer = new DataTransfer();
        validFiles.forEach((file) => dataTransfer.items.add(file));
        setFiles(dataTransfer.files);
      } else {
        toast.error("仅支持图片和文本文件！");
      }
    }
    setIsDragging(false);
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles) return;
    const validFiles = Array.from(selectedFiles).filter(
      (file) =>
        file.type.startsWith("image/") || file.type.startsWith("text/")
    );
    if (validFiles.length === selectedFiles.length) {
      const dataTransfer = new DataTransfer();
      validFiles.forEach((file) => dataTransfer.items.add(file));
      setFiles(dataTransfer.files);
    } else {
      toast.error("仅支持图片和文本文件");
    }
  };

  const onFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!input.trim() && (!files || files.length === 0)) {
      event.preventDefault();
      return;
    }
    houstonRef.current?.setConnectionState("connecting");
    handleSubmit(event, {
      body: {
        thinking: thinkingEnabled,
        previousResponseId: previousResponseIdRef.current,
      },
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
        href="https://github.com/vercel/ai-chatbot"
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

      <main className="houston-main">
        <ul className="chat">
          {messages.map((message) => (
            <li
              key={message.id}
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
                    {message.experimental_attachments.map((attachment) =>
                      attachment.contentType?.startsWith("image") ? (
                        <img
                          className="attachment-image"
                          key={attachment.name}
                          src={attachment.url}
                          alt={attachment.name ?? "attachment"}
                        />
                      ) : attachment.contentType?.startsWith("text") ? (
                        <div
                          key={attachment.name}
                          className="attachment-text"
                        >
                          {getTextFromDataUrl(attachment.url)}
                        </div>
                      ) : null
                    )}
                  </div>
                )}
            </li>
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
                {Array.from(files).map((file) =>
                  file.type.startsWith("image") ? (
                    <motion.img
                      key={file.name}
                      src={URL.createObjectURL(file)}
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
