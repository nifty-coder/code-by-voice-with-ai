const vscode = require('vscode');
const { Model, KaldiRecognizer } = require('vosk');
//const { google } = require('googleapis');
const { OpenAIAPI } = require('openai');

// Configuration
const model = new Model('models/vosk-model-small-en-us-0.22');
const recognizer = new KaldiRecognizer(model, 'en-US');

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
statusBarItem.text = 'Speech to Code: Off';
statusBarItem.command = 'code-by-voice-with-ai.startSpeechToCode';
statusBarItem.tooltip = 'Start speech-to-code';

let isListening = false;

// Securely store API keys
const getSecureApiKey = async (keyName) => {
  try {
    return await vscode.SecretStorage.getSecretStorage().getSecret(keyName);
  } catch (error) {
    vscode.window.showErrorMessage('Failed to retrieve API key from secure storage');
    
    const apiKey = await vscode.window.showInputBox({
        prompt: 'Please enter your API key for ' + keyName + ':',
        placeHolder: 'Enter your API key here',
        password: true
      });
  
      if (apiKey) {
        await vscode.SecretStorage.getSecretStorage().storeSecret(keyName, apiKey);
      }
  
      return apiKey;
    }
};

// Function to toggle listening state
const toggleListening = async () => {
  if (isListening) {
    stopListening();
  } else {
    startListening();
  }
};

// Function to start listening
const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
      // Start listening for speech using Vosk
      recognizer.start(stream);
  
      // Update status bar and flag to indicate listening mode
      statusBarItem.text = 'Speech to Code: On';
      statusBarItem.tooltip = 'Stop speech-to-code';
      isListening = true;
  
      // Start transcribing audio in a separate function
      transcribeAudio();
    } catch (error) {
      // Handle any errors that occur during initialization
      vscode.window.showErrorMessage('Failed to start listening:', error);
  
      // Check for permission errors and provide guidance
      if (error.name === 'NotAllowedError') {
        vscode.window.showInformationMessage('Please allow microphone access in your settings.');
      } else {
        // Handle other errors as needed
        console.error('Error starting listening:', error);
      }
    }
};
  
// Function to stop listening
const stopListening = async () => {
  stream.getAudioTracks()[0].stop(); // Stop audio stream
  recognizer.finish(); // Finish speech recognition
  statusBarItem.text = 'Speech to Code: Off';
  statusBarItem.tooltip = 'Start speech-to-code';
  isListening = false;
};

// Function to transcribe audio
const transcribeAudio = async () => {
    while (isListening) {
        const audioChunk = new Int16Array(stream.getAudioTracks()[0].getBuffer());
        const result = recognizer.acceptWaveform(audioChunk);
    
        if (result) {
          const transcribedText = result.text;
          console.log('Transcribed text:', transcribedText);
    
          try {
            const generatedCode = await generateCode(transcribedText);
            const confirmInsertion = await vscode.window.showInformationMessage('Confirm Generated code (yes or no):', generatedCode, { modal: true });
            if (confirmInsertion === 'Yes') {
              const activeTextEditor = vscode.window.activeTextEditor;
              if (activeTextEditor) {
                try {
                  activeTextEditor.edit((editBuilder) => {
                    editBuilder.insert(activeTextEditor.selection.active, generatedCode);
                  });
                  vscode.window.showInformationMessage('Code inserted successfully!');
                } catch (error) {
                  vscode.window.showErrorMessage('Failed to insert code');
                }
              } else {
                vscode.window.showInformationMessage('No active text editor found');
              }
            } else {
              vscode.window.showInformationMessage('Code insertion canceled');
            }
          } catch (error) {
            vscode.window.showErrorMessage('Failed to generate code:', error);
          }
        }
      }
};

// Function to generate code using Bard
const generateCode = async (transcribedText) => {
  const openaiApiKey = await getSecureApiKey('code-by-voice-with-ai.openaiApiKey');
  const openaiConnnection = new OpenAIAPI({ key: openaiApiKey });

  const openaiResponse = await openaiConnnection.complete({
    prompt: transcribedText,
    model: 'text-davinci-003',
    temperature: 0.4,
  });

  const generatedCode = openaiResponse.data.text;
  // Filter out text before and after code produced by OpenAI response
  const startIndex = generatedCode.indexOf('```');
  const endIndex = generatedCode.lastIndexOf('```');
  const filteredCode = generatedCode.substring(startIndex, endIndex + 3);
  console.log('Generated code:', filteredCode);
  return filteredCode;
};

const activate = (context) => {
  context.subscriptions.push(statusBarItem);
  toggleListening();
};

// Register command to toggle listening
vscode.commands.registerCommand('code-by-voice-with-ai.startSpeechToCode', activate);


// Listen for settings changes (to store API key securely)
vscode.workspace.onDidChangeConfiguration((event) => {
  if (event.affectsConfiguration('code-by-voice-with-ai.openaiApiKey')) {
    const newApiKey = event.getConfiguration().get('code-by-voice-with-ai.openaiApiKey');

    // Use SecretStorage to store the key securely
    vscode.SecretStorage.getSecretStorage().store('code-by-voice-with-ai.openaiApiKey', newApiKey)
      .then(() => {
        vscode.window.showInformationMessage('API key stored securely!');
      })
      .catch((error) => {
        vscode.window.showErrorMessage('Failed to store API key');
      });
  }
});