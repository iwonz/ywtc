'use client';
import { useEffect, useState } from 'react';
import {
	Alert,
	Button,
	Group,
	Modal,
	NativeSelect,
	NumberInput,
	PasswordInput,
	Stack,
	TextInput,
} from '@mantine/core';
import { api, type Translate } from './api';
const fresh = (type: string) =>
	type === 'yandex-wiki'
		? {
				type,
				apiUrl: 'https://api.wiki.yandex.net/v1',
				webUrl: 'https://wiki.example.com',
				authType: 'oauth',
				organization: { type: 'yandex360', id: '' },
			}
		: { type, deployment: 'data-center', baseUrl: '', authType: 'pat' };
export function Settings({
	root,
	t,
	onError,
}: {
	root: string;
	t: Translate;
	onError: (e: unknown) => void;
}) {
	const [settings, setSettings] = useState<any>(),
		[edit, setEdit] = useState<any>(),
		[name, setName] = useState(''),
		[previous, setPrevious] = useState(''),
		[probe, setProbe] = useState<any>();
	useEffect(() => {
		api(`${root}/settings`).then(setSettings).catch(onError);
	}, [root, onError]);
	const patch = (key: string, value: unknown) =>
		setEdit({ ...edit, [key]: value });
	const save = async () => {
		try {
			const connections = { ...settings.connections };
			if (previous && previous !== name) delete connections[previous];
			connections[name] = edit;
			const value = await api(`${root}/settings`, 'PUT', {
				...settings,
				connections,
			});
			setSettings(value);
			setEdit(undefined);
		} catch (e) {
			onError(e);
		}
	};
	return (
		<>
			<Group justify="space-between">
				<div className="section-title">
					{t('Подключения и настройки', 'Connections & settings')}
				</div>
				<Button
					onClick={() => {
						setPrevious('');
						setName('');
						setEdit(fresh('confluence'));
					}}
				>
					{t('Добавить подключение', 'Add connection')}
				</Button>
			</Group>
			{Object.entries(settings?.connections ?? {}).map(
				([key, value]: [string, any]) => (
					<div className="row" key={key}>
						<strong>{key}</strong>
						<span className="grow muted">
							{value.type} · {value.webUrl ?? value.baseUrl}
						</span>
						<span>
							{value.hasToken
								? t('Токен сохранён', 'Token stored')
								: t('Нет токена', 'No token')}
						</span>
						<Button
							variant="subtle"
							onClick={() => {
								setName(key);
								setPrevious(key);
								setEdit(structuredClone(value));
							}}
						>
							{t('Изменить', 'Edit')}
						</Button>
						<Button
							variant="light"
							onClick={() =>
								api(`${root}/settings/probe`, 'POST', { profile: key })
									.then(setProbe)
									.catch(onError)
							}
						>
							{t('Проверить доступ', 'Probe access')}
						</Button>
					</div>
				),
			)}
			{probe && (
				<Alert
					mt="md"
					color={probe.warnings?.length ? 'orange' : 'teal'}
					withCloseButton
					onClose={() => setProbe(undefined)}
				>
					{probe.product} {probe.version}
					{probe.warnings?.map((w: string) => (
						<p key={w}>{w}</p>
					))}
				</Alert>
			)}
			{settings && (
				<section className="section">
					<Group align="end">
						<NumberInput
							label={t('Параллельность по умолчанию', 'Default concurrency')}
							min={1}
							max={64}
							value={settings.defaults?.concurrency ?? 4}
							onChange={(v) =>
								setSettings({
									...settings,
									defaults: { ...settings.defaults, concurrency: Number(v) },
								})
							}
						/>
						<NumberInput
							label={t('Timeout (ms)', 'Timeout (ms)')}
							min={1000}
							max={300000}
							value={settings.defaults?.timeoutMs ?? 30000}
							onChange={(v) =>
								setSettings({
									...settings,
									defaults: { ...settings.defaults, timeoutMs: Number(v) },
								})
							}
						/>
						<Button
							variant="light"
							onClick={() =>
								api(`${root}/settings`, 'PUT', settings)
									.then(setSettings)
									.catch(onError)
							}
						>
							{t('Сохранить defaults', 'Save defaults')}
						</Button>
					</Group>
					<p className="muted">
						Mentions: {settings.mentions?.mode ?? 'off'} · Hashtags:{' '}
						{settings.hashtags?.mode ?? 'off'}
					</p>
				</section>
			)}
			<Modal
				opened={Boolean(edit)}
				onClose={() => setEdit(undefined)}
				title={t('Профиль подключения', 'Connection profile')}
				size="lg"
			>
				{edit && (
					<Stack>
						<TextInput
							label={t('Имя профиля', 'Profile name')}
							disabled={Boolean(previous)}
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
						<NativeSelect
							label={t('Система', 'Provider')}
							value={edit.type}
							data={['yandex-wiki', 'confluence']}
							onChange={(e) => setEdit(fresh(e.target.value))}
						/>
						{edit.type === 'yandex-wiki' ? (
							<>
								<TextInput
									label="API URL"
									value={edit.apiUrl}
									onChange={(e) => patch('apiUrl', e.target.value)}
								/>
								<TextInput
									label="Web URL"
									value={edit.webUrl}
									onChange={(e) => patch('webUrl', e.target.value)}
								/>
								<NativeSelect
									label={t('Тип организации', 'Organization type')}
									value={edit.organization.type}
									data={['yandex360', 'cloud']}
									onChange={(e) =>
										patch('organization', {
											...edit.organization,
											type: e.target.value,
										})
									}
								/>
								<TextInput
									label={t('ID организации', 'Organization ID')}
									value={edit.organization.id}
									onChange={(e) =>
										patch('organization', {
											...edit.organization,
											id: e.target.value,
										})
									}
								/>
								<NativeSelect
									label="Auth"
									data={['oauth', 'iam']}
									value={edit.authType}
									onChange={(e) => patch('authType', e.target.value)}
								/>
							</>
						) : (
							<>
								<NativeSelect
									label="Deployment"
									value={edit.deployment}
									data={['data-center', 'cloud']}
									onChange={(e) =>
										setEdit({
											...edit,
											deployment: e.target.value,
											authType:
												e.target.value === 'cloud' ? 'api-token' : 'pat',
										})
									}
								/>
								<TextInput
									label="Base URL"
									value={edit.baseUrl}
									onChange={(e) => patch('baseUrl', e.target.value)}
								/>
								{edit.deployment === 'cloud' && (
									<PasswordInput
										label={t(
											'Email · пусто = сохранить текущий',
											'Email · empty keeps current',
										)}
										autoComplete="off"
										value={edit.email ?? ''}
										onChange={(e) => patch('email', e.target.value)}
									/>
								)}
							</>
						)}
						<PasswordInput
							label={t(
								'Токен · пусто = сохранить текущий',
								'Token · empty keeps current',
							)}
							autoComplete="new-password"
							value={edit.token ?? ''}
							onChange={(e) => patch('token', e.target.value)}
						/>
						<Button
							disabled={!/^[a-z0-9][a-z0-9._-]*$/.test(name)}
							onClick={save}
						>
							{t('Сохранить профиль', 'Save profile')}
						</Button>
					</Stack>
				)}
			</Modal>
		</>
	);
}
