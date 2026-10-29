'use client';
import { useCallback, useEffect, useState } from 'react';
import {
	ActionIcon,
	Alert,
	Button,
	Group,
	Loader,
	Modal,
	Select,
	TextInput,
	Tooltip,
	useMantineColorScheme,
} from '@mantine/core';
import { Languages, Monitor, Moon, Plus, Sun } from 'lucide-react';
import { api, type Translate } from './api';
import { Tasks } from './tasks';
import { Reports } from './reports';
import { Decisions } from './decisions';
import { Settings } from './settings';
import { MigrationForm } from './migration-form';
import {Synchronization} from './synchronization';

export function ControlCenter() {
	const [connected, setConnected] = useState(false),
		[error, setError] = useState(''),
		[workspaces, setWorkspaces] = useState<any[]>([]),
		[workspace, setWorkspace] = useState(''),
		[tab, setTab] = useState('reports'),
		[language, setLanguage] = useState('ru'),
		[add, setAdd] = useState(false),
		[directory, setDirectory] = useState(''),
		[newMigration, setNewMigration] = useState(false),
		[job, setJob] = useState<string>(),
		[run, setRun] = useState<string>(),
		[revision, setRevision] = useState(0);
	const { colorScheme, setColorScheme } = useMantineColorScheme();
	const t: Translate = (ru, en) => (language === 'ru' ? ru : en);
	const root = `w/${workspace}`;
	const fail = useCallback(
		(error: unknown) =>
			setError(error instanceof Error ? error.message : String(error)),
		[],
	);
	const refresh = useCallback(async () => {
		const data = await api('workspaces');
		setWorkspaces(data.items);
		setWorkspace((value) => value || data.items[0]?.id || '');
		setConnected(true);
	}, []);
	useEffect(() => {
		try {
			setLanguage(
				localStorage.getItem('ywtc-ui-language') ??
					(navigator.language.startsWith('ru') ? 'ru' : 'en'),
			);
		} catch {}
		const secret = location.hash.slice(1);
		history.replaceState(null, '', location.pathname);
		(async () => {
			if (secret) await api('session', 'POST', { secret });
			await refresh();
		})().catch(fail);
	}, [fail, refresh]);
	const showJob = (id: string) => {
		setJob(id);
		setTab('jobs');
		setRevision((r) => r + 1);
		setNewMigration(false);
	};
	const showRun = (id: string) => {
		setRun(id);
		setTab('reports');
	};
	return (
		<main className="shell">
			<h1
				style={{
					position: 'absolute',
					width: 1,
					height: 1,
					overflow: 'hidden',
				}}
			>
				ywtc control center
			</h1>
			<header className="top">
				<Group gap="lg">
					<span className="brand">
						ywtc<span style={{ color: 'var(--mantine-color-cyan-5)' }}>_</span>
					</span>
					<span className="muted">
						{t('Центр миграций', 'Migration control center')}
					</span>
				</Group>
				<Group gap="xs">
					<Select
						aria-label={t('Рабочая директория', 'Workspace')}
						w={260}
						value={workspace}
						data={workspaces.map((w) => ({ value: w.id, label: w.path }))}
						onChange={(value) => {
							setWorkspace(value ?? '');
							setJob(undefined);
							setRun(undefined);
						}}
					/>
					<Tooltip label={t('Подключить workspace', 'Connect workspace')}>
						<ActionIcon
							aria-label={t('Подключить workspace', 'Connect workspace')}
							variant="subtle"
							onClick={() => setAdd(true)}
						>
							<Plus size={18} />
						</ActionIcon>
					</Tooltip>
					<Tooltip
						label={`${colorScheme} → ${colorScheme === 'auto' ? 'light' : colorScheme === 'light' ? 'dark' : 'auto'}`}
					>
						<ActionIcon
							aria-label="Theme"
							variant="subtle"
							onClick={() =>
								setColorScheme(
									colorScheme === 'auto'
										? 'light'
										: colorScheme === 'light'
											? 'dark'
											: 'auto',
								)
							}
						>
							{colorScheme === 'auto' ? (
								<Monitor size={18} />
							) : colorScheme === 'light' ? (
								<Sun size={18} />
							) : (
								<Moon size={18} />
							)}
						</ActionIcon>
					</Tooltip>
					<Tooltip label={language === 'ru' ? 'English' : 'Русский'}>
						<ActionIcon
							aria-label="Language"
							variant="subtle"
							onClick={() => {
								const next = language === 'ru' ? 'en' : 'ru';
								setLanguage(next);
								try {
									localStorage.setItem('ywtc-ui-language', next);
								} catch {}
							}}
						>
							<Languages size={18} />
						</ActionIcon>
					</Tooltip>
				</Group>
			</header>
			{error && (
				<Alert color="red" withCloseButton onClose={() => setError('')} mb="lg">
					{error}
				</Alert>
			)}
			{!connected ? (
				<div className="empty">
					{error ? (
						t(
							'Для подключения откройте URL из команды ywtc ui.',
							'Connect using the URL printed by ywtc ui.',
						)
					) : (
						<Loader size="sm" />
					)}
				</div>
			) : (
				<>
					<Group className="nav" justify="space-between">
						<Group gap="xs">
							{[
								['reports', t('Миграции и отчёты', 'Migrations & reports')],
								['jobs', t('Задачи', 'Tasks')],
								['decisions', 'Decisions'],
								['sync',t('Синхронизация','Synchronization')],
								['settings', t('Подключения', 'Connections')],
							].map(([id, label]) => (
								<Button
									key={id}
									variant={tab === id ? 'light' : 'subtle'}
									onClick={() => setTab(id)}
								>
									{label}
								</Button>
							))}
						</Group>
						<Button
							onClick={() => setNewMigration(true)}
							leftSection={<Plus size={16} />}
						>
							{t('Новая миграция', 'New migration')}
						</Button>
					</Group>
					{workspace && tab === 'jobs' && (
						<Tasks
							key={`${workspace}-${revision}`}
							root={root}
							t={t}
							initialJob={job}
							onError={fail}
							onReport={showRun}
							onJob={showJob}
						/>
					)}
					{workspace && tab === 'reports' && (
						<Reports
							key={workspace}
							root={root}
							t={t}
							initialRun={run}
							onError={fail}
							onJob={showJob}
						/>
					)}
					{workspace && tab === 'decisions' && (
						<Decisions
							key={workspace}
							root={root}
							t={t}
							onError={fail}
							onJob={showJob}
						/>
					)}
					{workspace&&tab==='sync'&&<Synchronization key={workspace} root={root} t={t} onError={fail} onJob={showJob}/>}
					{workspace && tab === 'settings' && (
						<Settings key={workspace} root={root} t={t} onError={fail} />
					)}
				</>
			)}
			<Modal
				opened={add}
				onClose={() => setAdd(false)}
				title={t(
					'Подключить или создать workspace',
					'Connect or create workspace',
				)}
			>
				<TextInput
					label={t('Полный путь', 'Absolute path')}
					value={directory}
					onChange={(e) => setDirectory(e.target.value)}
					autoFocus
				/>
				<Group mt="lg">
					<Button
						onClick={() =>
							api('workspaces', 'POST', { path: directory })
								.then(() => {
									setAdd(false);
									return refresh();
								})
								.catch(fail)
						}
					>
						{t('Подключить', 'Connect')}
					</Button>
					<Button
						variant="light"
						onClick={() =>
							api('workspaces', 'POST', { path: directory, create: true })
								.then(() => {
									setAdd(false);
									return refresh();
								})
								.catch(fail)
						}
					>
						{t('Создать', 'Create')}
					</Button>
				</Group>
			</Modal>
			<Modal
				opened={newMigration}
				onClose={() => setNewMigration(false)}
				title={t('Новая миграция', 'New migration')}
				size="lg"
			>
				<MigrationForm root={root} t={t} onError={fail} onJob={showJob} />
			</Modal>
		</main>
	);
}
