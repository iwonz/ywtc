import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import type {ReportPresentationPayload} from '../../src/report-contract';
import {App, ReportLoadError} from './App';
import {installReportFonts} from './fonts';
import '@mantine/core/styles.css';
import './styles.css';

installReportFonts();

function readPayload(): ReportPresentationPayload {
  const element = document.getElementById('ywtc-report-data');
  if (!element?.textContent) throw new Error('The report contains no embedded data payload.');
  const parsed = JSON.parse(element.textContent) as unknown;
  if (!parsed || typeof parsed !== 'object' || !('report' in parsed) || !('previews' in parsed)) {
    throw new Error('The embedded report payload is invalid.');
  }
  return parsed as ReportPresentationPayload;
}

const root = createRoot(document.getElementById('root')!);
try {
  root.render(<StrictMode><App payload={readPayload()} /></StrictMode>);
} catch (error) {
  root.render(<ReportLoadError message={error instanceof Error ? error.message : String(error)} />);
}
