'use client';
import { useEffect, useState } from 'react';
import {
	Alert,
	Button,
	Checkbox,
	Group,
	NativeSelect,
	NumberInput,
	Select,
	Stack,
	TextInput,
} from '@mantine/core';
import { api, type Translate } from './api';
export function MigrationForm({
	root,
	t,
	onError,
	onJob,
}: {
	root: string;
	t: Translate;
	onError: (error: unknown) => void;
	onJob: (id: string) => void;
}) {
	const [settings, setSettings] = useState<any>(),
		[sourceProfile, setSourceProfile] = useState(''),
		[destinationProfile, setDestinationProfile] = useState(''),
		[destinationType, setDestinationType] = useState('confluence'),
		[source, setSource] = useState(''),
		[destination, setDestination] = useState(''),
		[scope, setScope] = useState('subtree'),
		[sourceStatus, setSourceStatus] = useState('all'),
		[comments, setComments] = useState(true),
		[archive, setArchive] = useState(false),
		[live, setLive] = useState(false),
		[confirmed, setConfirmed] = useState(false),
		[busy, setBusy] = useState(false);
  const [concurrency, setConcurrency] = useState<number | string>('');
  const [stateFilename, setStateFilename] = useState('');
  const [fresh, setFresh] = useState(false), [rewrite, setRewrite] = useState(false);
	useEffect(() => {
		api(`${root}/settings`)
			.then((value) => {
				setSettings(value);
				setSourceProfile(
					Object.keys(value.connections).find(
						(n) => value.connections[n].type === 'yandex-wiki',
					) ??
						Object.keys(value.connections)[0] ??
						'',
				);
				setDestinationProfile(
					Object.keys(value.connections).find(
						(n) => value.connections[n].type === 'confluence',
					) ?? '',
				);
			})
			.catch(onError);
	}, [root, onError]);
	const profiles = Object.entries(settings?.connections ?? {}) as [
		string,
		any,
	][];
	const file = ['markdown', 'html'].includes(destinationType);
	async function submit() {
		setBusy(true);
		try {
			const request = {
				kind: 'migrate',
				source,
				sourceProfile,
				destination,
				...(!file ? { destinationProfile } : { format: destinationType }),
				scope,
				sourceStatus,
				comments,
				archive: file && archive,
				dryRun: !live,
        ...(concurrency !== '' ? {concurrency: Number(concurrency)} : {}),
        ...(stateFilename.trim() ? {stateFilename: stateFilename.trim()} : {}),
        ...(fresh ? {fresh: true} : {}), ...(rewrite && !file ? {rewrite: true} : {}),
			};
			const job = await api(`${root}/jobs`, 'POST', {
				request,
				confirmed: live && confirmed,
				...(file ? { exportRoot: destination } : {}),
			});
			onJob(job.id);
		} catch (error) {
			onError(error);
		} finally {
			setBusy(false);
		}
	}
	return (
		<Stack>
			{!profiles.length && (
				<Alert color="orange">
					{t(
						'Сначала создайте подключения в настройках.',
						'Create connections in settings first.',
					)}
				</Alert>
			)}
			<Select
				label={t('Профиль источника', 'Source profile')}
				value={sourceProfile}
				data={profiles.map(([name, p]) => ({
					value: name,
					label: `${name} · ${p.type}`,
				}))}
				onChange={(v) => setSourceProfile(v ?? '')}
			/>
			<TextInput
				label={t(
					'Источник · URL / ID / slug / space URL',
					'Source · URL / ID / slug / space URL',
				)}
				value={source}
				onChange={(e) => setSource(e.target.value)}
				required
			/>
			<NativeSelect
				label={t('Назначение', 'Destination')}
				value={destinationType}
				onChange={(e) => {
					setDestinationType(e.target.value);
					setArchive(false);
					setDestinationProfile(
						profiles.find(([, p]) => p.type === e.target.value)?.[0] ?? '',
					);
				}}
				data={[
					{ value: 'confluence', label: 'Confluence' },
					{ value: 'yandex-wiki', label: 'Yandex Wiki' },
					{ value: 'markdown', label: 'Markdown' },
					{ value: 'html', label: 'HTML' },
				]}
			/>
			{!file && (
				<Select
					label={t('Профиль назначения', 'Destination profile')}
					value={destinationProfile}
					data={profiles
						.filter(([, p]) => p.type === destinationType)
						.map(([name]) => name)}
					onChange={(v) => setDestinationProfile(v ?? '')}
				/>
			)}
			<TextInput
				label={
					file
						? t('Каталог экспорта', 'Export directory')
						: t('Родительская страница назначения', 'Destination parent page')
				}
				value={destination}
				onChange={(e) => setDestination(e.target.value)}
				required
			/>
			<Group grow>
				<NativeSelect
					label="Scope"
					value={scope}
					onChange={(e) => setScope(e.target.value)}
					data={['page', 'subtree', 'linked']}
				/>
				<NativeSelect
					label={t('Статус источника', 'Source status')}
					value={sourceStatus}
					onChange={(e) => setSourceStatus(e.target.value)}
					data={['all', 'current']}
				/>
			</Group>
			<Checkbox
				label={t('Переносить комментарии', 'Include comments')}
				checked={comments}
				onChange={(e) => setComments(e.target.checked)}
			/>
			{file && (
				<Checkbox
					label={t('Создать ZIP', 'Create ZIP')}
					checked={archive}
					onChange={(e) => setArchive(e.target.checked)}
				/>
			)}
			<Checkbox
				label={t(
					'Live · записать в destination',
					'Live · write to destination',
				)}
				checked={live}
				onChange={(e) => {
					setLive(e.target.checked);
					setConfirmed(false);
				}}
			/>
			{live && (
				<>
					<Alert color="orange">
						{t(
							'Source заменит содержимое сопоставленных страниц. Сначала рекомендуется dry-run.',
							'Source replaces mapped destination content. A dry-run is recommended first.',
						)}
					</Alert>
					<Checkbox
						label={t(
							'Подтверждаю запись выбранной миграции',
							'I confirm this migration will write destination data',
						)}
						checked={confirmed}
						onChange={(e) => setConfirmed(e.target.checked)}
					/>
				</>
			)}
      <details><summary>{t('Дополнительные параметры', 'Advanced options')}</summary><Stack mt="md">
        <NumberInput label={t('Параллельность', 'Concurrency')} placeholder={String(settings?.defaults?.concurrency ?? 4)} value={concurrency} onChange={setConcurrency} min={1} max={64} allowDecimal={false}/>
        <TextInput label={t('State · путь внутри workspace (необязательно)', 'State · path inside workspace (optional)')} value={stateFilename} onChange={e => setStateFilename(e.target.value)}/>
        <Checkbox label={t('Fresh · новые mappings; возможны дубликаты', 'Fresh · new mappings; may create duplicates')} checked={fresh} onChange={e => {setFresh(e.target.checked);if (e.target.checked) setRewrite(false);}}/>
        {!file && <Checkbox label={t('Rewrite · только существующие IDs, без создания страниц', 'Rewrite · existing IDs only; no new pages')} checked={rewrite} onChange={e => {setRewrite(e.target.checked);if (e.target.checked) setFresh(false);}}/>}
      </Stack></details>
			<Button
				disabled={
        concurrency !== '' && (Number(concurrency) < 1 || Number(concurrency) > 64) ||
					!source.trim() ||
					!destination.trim() ||
					!sourceProfile ||
					(!file && !destinationProfile) ||
					(live && !confirmed)
				}
				loading={busy}
				onClick={submit}
			>
				{live
					? t('Запустить перенос', 'Start migration')
					: t('Сначала dry-run', 'Start dry-run')}
			</Button>
		</Stack>
	);
}
