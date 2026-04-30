<script lang="ts">
  import OInput, { omniContent } from '/lib/OInput.svelte';
  import M from '/lib/M.svelte';
  import type { Message, Stack, AssistantMessage } from '/lib/types';
  import ModelPicker from '/lib/models/ModelPicker.svelte';
  import ToolPicker from '/lib/tools/ToolPicker.svelte';
  import PromptPicker, { allPrompts } from '/lib/prompts/PromptPicker.svelte';
  import generate from '/lib/generate';
  import ABase from '/lib/ABase.svelte';
  import AImages from '/lib/AImages.svelte';
  import AIngest from '/lib/AIngest.svelte';
  import TextLoader from '/lib/TextLoader.svelte';
  import ONav from '/lib/ONav.svelte';
  import OHistory from '/lib/OHistory.svelte';
  import sign from './sign.remote';

  let stack: Stack = $state([]);
  let messages: Message[] = $state([]);
  let enabledTools: string[] = $state([]);
  let selectedPrompt: string = $state('None');

  let petitionName = $state('');
  let petitionMessage = $state('');
  let petitionSubmitting = $state(false);
  let petitionDone = $state(false);

  const handleSign = async () => {
    if (!petitionName.trim()) return;
    petitionSubmitting = true;
    try {
      await sign({ name: petitionName.trim(), message: petitionMessage.trim() || undefined });
      petitionDone = true;
    } finally {
      petitionSubmitting = false;
    }
  };

  let context = $derived(
    ((messages.reduce((acc, msg) => {
      if (msg.role == 'assistant') {
        for (const part of msg.content) {
          if (part.type == 'text') {
            acc += part.text.length;
          }
        }
      } else if ('content' in msg && typeof msg.content == 'string') {
        acc += msg.content.length;
      }
      return acc;
    }, 0) +
      $omniContent.length) /
      4) *
      1.1,
  );
  let useImageInput = $derived(messages.some((m) => 'imageURI' in m));

  let aborter: AbortController | undefined = $state();
  let hasConnected = $state(false);
  const abort = $derived(
    aborter
      ? () => {
          aborter!.abort();
          aborter = undefined;
        }
      : undefined,
  );
  const abortable = async (code: () => Promise<void>) => {
    try {
      aborter = new AbortController();
      await code();
    } finally {
      aborter = undefined;
      hasConnected = false;
    }
  };

  const submit = async (question: string) => {
    messages.push({ role: 'user', content: question });

    const addMessage = <T extends Message>(base: T): T => {
      hasConnected = true;
      const temp = $state(base);
      messages.push(temp);
      return temp;
    };

    abortable(async () => {
      const systemPrompt = allPrompts[selectedPrompt];
      await generate(
        systemPrompt ? [{ role: 'system' as const, content: systemPrompt }, ...messages] : messages,
        stack,
        addMessage,
        aborter?.signal,
        enabledTools,
      );
    });
  };
</script>

<ONav />
<div class="top-right-controls">
  <PromptPicker bind:selectedPrompt toolsEnabled={enabledTools.length > 0} />
  <ToolPicker bind:enabledTools />
</div>
<ModelPicker bind:stack minContext={context} {useImageInput} />
<ABase />
<AImages addMessage={(message) => messages.push(message)} />
<AIngest
  addMessage={(message) => messages.push(message)}
  removeMessage={(message) => (messages = messages.filter((m) => m != message))}
/>

{#if messages.length > 0}
  <div class="chat">
    {#each messages.filter((m) => m.role != 'tool') as message, i (message)}
      <M
        {message}
        {messages}
        autoScroll={i == messages.length - 1 && message.role == 'assistant'}
        isGenerating={Boolean(aborter)}
      />
    {/each}
    {#if !messages.some((m, i) => i == messages.length - 1 && (m.role == 'assistant' || 'attachmentData' in m))}
      <div class="assistant-spacer">
        {#if hasConnected}
          <TextLoader text="Generating" />
        {:else if aborter}
          <TextLoader text="Connecting" />
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <div class="hack-club-thing">
    <p>
      Hack Club is a charity that helps teens code, and they just added 200+ models to Cosine. But
      they're about to remove them. Sign this if you want to keep using models like Claude Opus 4.7
      and Gemini 3.1 Pro.
    </p>
    {#if petitionDone}
      <p class="petition-done">Thanks for signing!</p>
    {:else}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleSign();
        }}
      >
        <input
          id="name"
          placeholder="Your name"
          required
          bind:value={petitionName}
          disabled={petitionSubmitting}
        />
        <textarea
          placeholder="Message - think how these models help you code, or how they make Cosine better (optional)"
          bind:value={petitionMessage}
          disabled={petitionSubmitting}
        ></textarea>
        <button type="submit" disabled={petitionSubmitting || !petitionName.trim()}>
          {petitionSubmitting ? 'Signing...' : 'Sign'}
        </button>
      </form>
    {/if}
  </div>
  <!-- <p
    style:color="var(--m3c-on-surface-variant)"
    style:margin-block="auto"
    style:text-align="center"
  >
    Also try <a href="https://github.com/0k-web/0k#launch-0k">0K</a>.
  </p> -->
{/if}
<div class="input">
  <OInput {abort} animate={hasConnected} {submit} />
</div>
<OHistory bind:messages isGenerating={Boolean(aborter)} />

<style>
  .chat {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 50rem;
    @media (width > 50rem) {
      max-width: min(calc(100dvw - 20rem), 50rem);
    }
    gap: 0.5rem;
    padding-block: 1.5rem;
    align-self: center;
    flex-grow: 1;
  }
  .input {
    display: flex;
    position: sticky;
    width: 100%;
    max-width: 50rem;
    @media (width > 50rem) {
      max-width: min(calc(100dvw - 20rem), 50rem);
    }
    align-self: center;
    bottom: 0;
    background-color: var(--m3c-surface-container-low);
    border-start-start-radius: 1.5rem;
    border-start-end-radius: 1.5rem;
  }
  .assistant-spacer {
    padding: 0.4rem;
    height: calc(100dvh - 4rem - 1.5rem - 10rem);
    color: var(--m3c-on-surface-variant);
  }
  .top-right-controls {
    display: flex;
    position: fixed;
    top: 0.5rem;
    right: 0.5rem;
    gap: 0.25rem;
    :global(.chooser) {
      border-radius: 0.5rem;
      padding-block: 0.625rem;
      padding-inline: 0.5rem;
      background-color: var(--m3c-surface-container-lowest);
      color: var(--m3c-on-surface-variant);
      transition: var(--m3-easing-fast);
      &.enabled {
        background-color: var(--m3c-primary-container-subtle);
        color: var(--m3c-on-primary-container-subtle);
      }
    }
  }
  a {
    color: var(--m3c-secondary);
  }
  .hack-club-thing {
    margin-block: auto;
    text-align: center;
    max-width: 28rem;
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: var(--m3c-on-surface-variant);
    & form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      align-items: center;
    }
    & input,
    & textarea {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border-radius: 0.75rem;
      border: 1px solid var(--m3c-outline-variant);
      background: var(--m3c-surface-container);
      color: var(--m3c-on-surface);
      font: inherit;
      resize: vertical;
      &:focus {
        outline: 2px solid var(--m3c-primary);
        outline-offset: -1px;
      }
      &:disabled {
        opacity: 0.6;
      }
    }
    & textarea {
      min-height: 4rem;
    }
    & button {
      @apply --m3-label-large;
      padding: 0.5rem 1.5rem;
      height: 2.5rem;
      border-radius: var(--m3-shape-full);
      border: none;
      background: var(--m3c-primary);
      color: var(--m3c-on-primary);
      cursor: pointer;
      transition: var(--m3-easing-fast);
      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
  }
  .petition-done {
    color: var(--m3c-primary);
    font-weight: 600;
  }
</style>
