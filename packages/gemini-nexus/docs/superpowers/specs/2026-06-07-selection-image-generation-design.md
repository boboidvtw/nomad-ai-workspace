# Selection Image Generation Design

## Goal

Add a one-click image generation action to the text selection toolbar. When the user selects text and clicks the new image button, Gemini Nexus should use the selected text as the image prompt and render the generated image in the existing floating result window.

## Behavior

- The text selection toolbar shows a fixed "Generate image" button next to the existing quick actions.
- Clicking the button immediately starts generation. There is no intermediate prompt editing step.
- The ask window opens at the selection position, shows the selected text as context, uses a "Generate image" title, and displays a generation loading message.
- The request uses the existing toolbar provider/model selection and the existing `QUICK_ASK` streaming path.
- Generated image rendering, image fetching, and generated-image watermark cleanup reuse the current toolbar renderer.

## Prompting

The selected text is wrapped as source material, not as instructions to execute. The generated prompt asks the model to create one image based on the selected text, preserving concrete visual details and avoiding unrelated additions.

## Testing

Cover the new button in template tests, event binding tests, dispatcher tests, action payload tests, and i18n tests.
