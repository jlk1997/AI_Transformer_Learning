<script lang="ts">
	import { onMount } from 'svelte';
	import { locale, messages } from '~/i18n';
	import {
		tutorSettings,
		tutorSettingsOpen,
		tutorServiceDown,
		tutorTestResult
	} from '~/tutor/store';
	import { loadTutorSettings, saveTutorSettings, testTutorConnection } from '~/tutor/api';

	$: m = ($messages as any).tutor || {};
	$: zh = $locale !== 'en';
	$: privacyNote = m.privacy
		|| (zh ? ($tutorSettings?.privacyNoteZh || '提问时会把当前关卡和画面上的数字发给 MiniMax，不会发送 API key，默认也不会上传训练文本。')
			: ($tutorSettings?.privacyNoteEn || 'Asking sends the current station and on-screen numbers to MiniMax, never the API key, and does not upload training text by default.'));

	let apiKey = '';
	let platform = 'cn';
	let baseUrl = 'https://api.minimax.cn/v1';
	let model = 'MiniMax-M3.1-Flash';
	let reasoningEffort = 'medium';
	let showThinking = false;
	let saving = false;
	let status = '';
	let loaded = false;

	const hydrate = (s: any) => {
		if (!s) return;
		platform = s.platform || 'cn';
		baseUrl = s.baseUrl || 'https://api.minimax.cn/v1';
		model = s.model || 'MiniMax-M3.1-Flash';
		reasoningEffort = s.reasoningEffort || 'medium';
		showThinking = !!s.showThinking;
		apiKey = '';
	};

	onMount(async () => {
		try {
			const s = await loadTutorSettings();
			hydrate(s);
		} catch {
			tutorServiceDown.set(true);
		} finally {
			loaded = true;
		}
	});

	$: if ($tutorSettings) hydrate($tutorSettings);

	const onPlatform = (next: string) => {
		platform = next;
		if (next === 'cn') baseUrl = $tutorSettings?.defaults?.cn || 'https://api.minimax.cn/v1';
		if (next === 'overseas') baseUrl = $tutorSettings?.defaults?.overseas || 'https://api.minimax.io/v1';
	};

	const save = async (clearKey = false) => {
		saving = true;
		status = '';
		try {
			const body: Record<string, unknown> = {
				platform,
				baseUrl,
				model,
				reasoningEffort,
				showThinking
			};
			if (clearKey) body.clearKey = true;
			else if (apiKey.trim()) body.apiKey = apiKey.trim();
			const s = await saveTutorSettings(body);
			apiKey = '';
			status = zh ? '已保存在本机教学服务。' : 'Saved on the local teaching service.';
			tutorTestResult.set('');
			hydrate(s);
		} catch (e: any) {
			status =
				e?.message === 'service_down'
					? zh
						? '本机教学服务没有在运行，无法保存密钥。'
						: 'The local teaching service is not running, so the key cannot be saved.'
					: zh
						? '保存失败。'
						: 'Save failed.';
		} finally {
			saving = false;
		}
	};

	const test = async () => {
		status = '';
		tutorTestResult.set(zh ? '正在测试连接…' : 'Testing the connection…');
		const r = await testTutorConnection();
		tutorTestResult.set(zh ? r.messageZh || '' : r.messageEn || '');
		if (r.ok) status = zh ? '连接成功。' : 'Connection succeeded.';
	};

	const close = () => tutorSettingsOpen.set(false);
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') close();
	};
</script>

<svelte:window on:keydown={onKey} />

{#if $tutorSettingsOpen}
	<div class="scrim" data-te-tutor="settings-panel" role="dialog" aria-modal="true" aria-labelledby="te-tutor-settings-title">
		<div class="panel">
			<header>
				<h2 id="te-tutor-settings-title">{m.settingsTitle || (zh ? '导师设置' : 'Tutor settings')}</h2>
				<button type="button" class="ghost" data-te-tutor="settings-close" on:click={close}>{m.close || (zh ? '关闭' : 'Close')}</button>
			</header>

			{#if $tutorServiceDown}
				<p class="warn" data-te-tutor="service-down">
					{m.serviceDown ||
						(zh
							? '本机教学服务还没连上。请先双击项目里的「启动帮手」。密钥只保存在这台电脑的教学服务里，不会写进页面。'
							: 'The local teaching service is not connected. Double-click “启动帮手” (Start helper) in the project folder first. The key is stored only on that local service, never in the page.')}
				</p>
			{/if}

			<label class="field">
				<span>{m.apiKey || (zh ? 'API key' : 'API key')}</span>
				<input
					type="password"
					autocomplete="off"
					spellcheck="false"
					data-te-tutor="settings-key"
					placeholder={$tutorSettings?.configured
						? zh
							? `已配置 ···${$tutorSettings.keyLast4}，要更换请重新输入`
							: `Configured ···${$tutorSettings.keyLast4}. Type a new key to replace it.`
						: zh
							? '只保存在本机，不会写进仓库或页面'
							: 'Stored only on this machine, never in the repo or the page'}
					bind:value={apiKey}
				/>
			</label>
			{#if $tutorSettings?.configured}
				<p class="muted" data-te-tutor="key-last4">{zh ? '当前密钥只回显后四位：' : 'Read-back shows only the last four digits: '}···{$tutorSettings.keyLast4}</p>
			{/if}

			<fieldset class="field">
				<legend>{m.platform || (zh ? '平台' : 'Platform')}</legend>
				<label><input type="radio" name="te-plat" value="cn" checked={platform === 'cn'} data-te-tutor="plat-cn" on:change={() => onPlatform('cn')} /> {zh ? '国内' : 'China'} https://api.minimax.cn/v1</label>
				<label><input type="radio" name="te-plat" value="overseas" checked={platform === 'overseas'} data-te-tutor="plat-overseas" on:change={() => onPlatform('overseas')} /> {zh ? '海外' : 'Overseas'} https://api.minimax.io/v1</label>
				<label><input type="radio" name="te-plat" value="custom" checked={platform === 'custom'} data-te-tutor="plat-custom" on:change={() => onPlatform('custom')} /> {zh ? '自定义地址' : 'Custom URL'}</label>
				<p class="muted">{zh ? '国内和海外的密钥不能混用。' : 'China and overseas keys are not interchangeable.'}</p>
			</fieldset>

			<label class="field">
				<span>{m.baseUrl || (zh ? '接口地址' : 'Base URL')}</span>
				<input type="text" data-te-tutor="settings-url" bind:value={baseUrl} disabled={platform !== 'custom'} />
			</label>

			<label class="field">
				<span>{m.model || (zh ? '模型' : 'Model')}</span>
				<input type="text" data-te-tutor="settings-model" bind:value={model} />
			</label>

			<label class="field">
				<span>{m.effort || (zh ? '思考深度' : 'Reasoning effort')}</span>
				<select data-te-tutor="settings-effort" bind:value={reasoningEffort}>
					<option value="low">low</option>
					<option value="medium">medium</option>
					<option value="high">high</option>
					<option value="xhigh">xhigh</option>
					<option value="max">max</option>
				</select>
				<span class="muted">{m.effortNote || (zh ? '此模型不能关闭思考，默认 medium。' : 'This model cannot turn thinking off. Default is medium.')}</span>
			</label>

			<label class="check">
				<input type="checkbox" data-te-tutor="settings-thinking" bind:checked={showThinking} />
				{m.showThinking || (zh ? '调试：在导师面板里显示模型思考（默认对学生隐藏）' : 'Debug: show model thinking in the panel (hidden from students by default)')}
			</label>

			<p class="privacy" data-te-tutor="privacy">
				{privacyNote}
			</p>
			<p class="links">
				{zh ? '申请密钥：' : 'Get a key: '}
				<a href="https://platform.minimaxi.com" target="_blank" rel="noreferrer">https://platform.minimaxi.com</a>
				（{zh ? '国内' : 'China'}）
				<a href="https://platform.minimax.io" target="_blank" rel="noreferrer">https://platform.minimax.io</a>
				（{zh ? '海外' : 'overseas'}）
			</p>

			<div class="actions">
				<button type="button" class="primary" data-te-tutor="settings-save" disabled={saving || $tutorServiceDown} on:click={() => save(false)}>{m.save || (zh ? '保存' : 'Save')}</button>
				<button type="button" class="ghost" data-te-tutor="settings-test" disabled={saving || $tutorServiceDown} on:click={test}>{m.test || (zh ? '一键测连接' : 'Test connection')}</button>
				<button type="button" class="ghost" data-te-tutor="settings-clear" disabled={saving || $tutorServiceDown || !$tutorSettings?.configured} on:click={() => save(true)}>{m.clearKey || (zh ? '清除密钥' : 'Clear key')}</button>
			</div>
			{#if status}
				<p class="status" data-te-tutor="settings-status">{status}</p>
			{/if}
			{#if $tutorTestResult}
				<p class="status" data-te-tutor="settings-test-result">{$tutorTestResult}</p>
			{/if}
			{#if !loaded}
				<p class="muted">{zh ? '正在读取本机设置…' : 'Reading local settings…'}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 11000;
		background: rgba(24, 16, 40, 0.28);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 4.5rem 1rem 1.5rem;
	}
	.panel {
		width: min(560px, 96vw);
		max-height: calc(100vh - 6rem);
		overflow: auto;
		background: #fff;
		border: 1px solid #ddd6fe;
		border-radius: 0.85rem;
		box-shadow: 0 16px 48px rgba(76, 29, 149, 0.2);
		padding: 1rem 1.15rem 1.15rem;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.7rem;
	}
	h2 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 800;
		color: #4c1d95;
		flex: 1;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0.7rem 0;
		border: none;
		padding: 0;
	}
	.field span,
	.field legend {
		font-size: 0.82rem;
		font-weight: 700;
		color: #4b5563;
	}
	input[type='text'],
	input[type='password'],
	select {
		border: 1px solid #e5e7eb;
		border-radius: 0.4rem;
		padding: 0.4rem 0.55rem;
		font-size: 0.9rem;
	}
	.muted {
		font-size: 0.78rem;
		color: #6b7280;
		margin: 0.15rem 0 0;
	}
	.check {
		display: flex;
		gap: 0.45rem;
		align-items: flex-start;
		font-size: 0.85rem;
		color: #374151;
		margin: 0.4rem 0 0.6rem;
	}
	.privacy,
	.links {
		font-size: 0.8rem;
		color: #4b5563;
		line-height: 1.45;
		margin: 0.35rem 0;
	}
	.warn {
		background: #fef3c7;
		border: 1px solid #f59e0b;
		color: #92400e;
		border-radius: 0.4rem;
		padding: 0.45rem 0.6rem;
		font-size: 0.85rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.8rem;
	}
	.primary,
	.ghost {
		border-radius: 0.4rem;
		padding: 0.4rem 0.8rem;
		cursor: pointer;
		font-size: 0.85rem;
	}
	.primary {
		background: #7c3aed;
		color: #fff;
		border: none;
		font-weight: 700;
	}
	.ghost {
		background: #fff;
		border: 1px solid #e5e7eb;
		color: #4b5563;
	}
	.primary:disabled,
	.ghost:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.status {
		margin: 0.45rem 0 0;
		font-size: 0.85rem;
		color: #5b21b6;
		font-weight: 600;
	}
</style>
