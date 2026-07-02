"use client";

import type { CSSProperties } from "react";
import {
  Check,
  Download,
  LoaderCircle,
  RefreshCw
} from "lucide-react";

import type { PdvUpdateStatus } from "@/lib/local-pdv-store";
import { CashierModal } from "./cashier-modal";

export function shouldShowPdvUpdateModal(status: PdvUpdateStatus | null) {
  return status?.status === "available" ||
    status?.status === "downloading" ||
    status?.status === "downloaded";
}

function formatPdvReleaseVersion(version: string | null | undefined) {
  const normalized = String(version || "").trim();
  const match = /^(\d+)\.(\d+)\.0$/.exec(normalized);

  if (match) {
    return `v${match[1]}.${match[2]}`;
  }

  return normalized ? `v${normalized}` : "nova versão";
}

function formatUpdateSize(bytes: number | null | undefined) {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) {
    return "Tamanho indisponível";
  }

  const megabytes = size / 1024 / 1024;

  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: megabytes >= 100 ? 0 : 1,
    minimumFractionDigits: megabytes >= 100 ? 0 : 1
  }).format(megabytes)} MB`;
}

function formatUpdateSpeed(bytesPerSecond: number | null | undefined) {
  const speed = Number(bytesPerSecond);

  if (!Number.isFinite(speed) || speed <= 0) {
    return "Calculando velocidade";
  }

  const megabytesPerSecond = speed / 1024 / 1024;

  if (megabytesPerSecond >= 0.1) {
    return `${new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1
    }).format(megabytesPerSecond)} MB/s`;
  }

  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0
  }).format(speed / 1024)} KB/s`;
}

export function PdvUpdateModal({
  hasOpenSession,
  isBusy,
  onPostpone,
  onUpdate,
  status
}: {
  hasOpenSession: boolean;
  isBusy: boolean;
  onPostpone: () => void;
  onUpdate: () => void | Promise<void>;
  status: PdvUpdateStatus | null;
}) {
  if (!shouldShowPdvUpdateModal(status)) {
    return null;
  }

  const availableVersion = formatPdvReleaseVersion(status?.availableVersion);
  const updateSize = formatUpdateSize(status?.sizeBytes);
  const progress = Math.max(0, Math.min(100, Math.round(Number(status?.progress ?? 0))));
  const isDownloaded = status?.status === "downloaded";
  const isDownloading = status?.status === "downloading";
  const isAvailable = status?.status === "available";
  const hasStartedDownload = isDownloading || isDownloaded;
  const progressValue = isAvailable ? 0 : progress;
  const progressLabel = `${progressValue}%`;
  const progressStyle = {
    "--pdv-update-progress": `${progressValue}%`
  } as CSSProperties;
  const updateStatusLabel = isDownloaded
    ? hasOpenSession
      ? "Feche o caixa para instalar"
      : "Download concluído"
    : isDownloading
      ? formatUpdateSpeed(status?.bytesPerSecond)
      : "Baixe agora ou continue usando esta versão por enquanto.";
  const primaryLabel = isDownloaded
    ? hasOpenSession
      ? "Feche o caixa"
      : "Reiniciar e instalar"
    : isDownloading
      ? "Baixando"
      : "Atualizar PDV";
  const primaryDisabled = isBusy || isDownloading || (isDownloaded && hasOpenSession);

  return (
    <CashierModal
      title="Atualização disponível"
      description={`Versão ${availableVersion} pronta para este PDV.`}
      headingIcon={
        <span className="pdv-update-modal-icon" aria-hidden="true">
          {isDownloaded ? <Check size={22} /> : <Download size={22} />}
        </span>
      }
      onClose={onPostpone}
      dismissible={false}
      size="sm"
      footer={
        <>
          <button className="pdv-secondary-action" type="button" disabled={isDownloading || isBusy} onClick={onPostpone}>
            Deixar para depois
          </button>
          <button className="pdv-primary-action" type="button" disabled={primaryDisabled} onClick={onUpdate}>
            {isBusy || isDownloading ? (
              <LoaderCircle className="pdv-spin" aria-hidden="true" size={17} />
            ) : isDownloaded ? (
              <RefreshCw aria-hidden="true" size={17} />
            ) : (
              <Download aria-hidden="true" size={17} />
            )}
            {primaryLabel}
          </button>
        </>
      }
    >
      <div className="pdv-update-modal-body">
        <div className="pdv-update-modal-progress" aria-label={`Progresso do download: ${progress}%`} style={progressStyle}>
          <span className="pdv-update-modal-progress-fill" />
          <strong className="pdv-update-modal-progress-label pdv-update-modal-progress-label-base">{progressLabel}</strong>
          <strong className="pdv-update-modal-progress-label pdv-update-modal-progress-label-fill">{progressLabel}</strong>
        </div>

        <div className="pdv-update-modal-meta">
          <span>{updateStatusLabel}</span>
          {hasStartedDownload ? <strong>{updateSize}</strong> : null}
        </div>
      </div>
    </CashierModal>
  );
}
