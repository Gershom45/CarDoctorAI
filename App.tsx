import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import OpenAI from "openai";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import { MaterialIcons } from "@expo/vector-icons";
import { OPENAI_API_KEY } from "@env";

// Import CarGenie image
import CarGenie from "./assets/CarGenie.png";

if (!OPENAI_API_KEY) {
  console.error("OpenAI API key is missing.");
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const VoiceThemeSelector = ({ selectedVoice, onVoiceSelected }) => {
  const voiceThemes = {
    alloy: { color: "#06d6a0", icon: "build", description: "Technical and balanced tone" },
    echo:  { color: "#26547c", icon: "warning", description: "Confident and serious tone" },
    fable: { color: "#ef476f", icon: "local-gas-station", description: "Friendly, helpful mechanic vibe" },
    onyx:  { color: "#ffd166", icon: "car-repair", description: "Deep, reliable technician voice" },
  };

  return (
    <View style={styles.voiceThemeContainer}>
      <Text style={styles.voiceThemeTitle}>Select Voice Style</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.voiceThemeScroll}>
        {Object.entries(voiceThemes).map(([voice, theme]) => (
          <TouchableOpacity
            key={voice}
            style={[
              styles.voiceThemeOption,
              { backgroundColor: theme.color },
              selectedVoice === voice && styles.selectedVoiceTheme
            ]}
            onPress={() => onVoiceSelected(voice)}
          >
            <MaterialIcons name={theme.icon} size={24} color="white" />
            <Text style={styles.voiceThemeName}>{voice.charAt(0).toUpperCase() + voice.slice(1)}</Text>
            <Text style={styles.voiceThemeDescription}>{theme.description}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const App = () => {
  const [carInfo, setCarInfo] = useState("");
  const [imageLocation, setImageLocation] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  // Checklist text for self-inspection
  const checklistText = `
• Check brake pedal firmness
• Look under for leaks
• Turn on all lights (headlights, brake, turn signals)
• Test wipers and washer fluid
• Note any unusual smells or smoke
  `.trim();

  const systemPrompt = `
You are CarDoctor, an AI assistant specializing in vehicle diagnostics and troubleshooting. When a user shares images of dashboard warning lights, engine components, or other vehicle issues:

1. Identify dashboard symbols and explain severity (urgent, needs attention, informational).
2. Suggest common-to-rare causes based on the make/model (if known).
3. Detect oil vs. coolant leaks.
4. Diagnose tire wear from alignment vs. inflation.
5. Spot critical alerts: brake line leaks, belts, etc.
6. Offer safe “limp mode” advice.
7. Prompt questions like "How many miles since last oil change?"
8. Clearly assess driving safety.
9. Suggest safe basic checks (no tools).
10. Recommend when to seek professional service.
11. Identify parts in the photo and explain how they relate to the issue.
12. Recommend documenting intermittent problems.
13. Mention whether it is safe to drive the vehicle or not based on the analysis.
14. Provide maintenance suggestions based on mileage, time since last service, or visible wear.
15. Offer seasonal advice if applicable.
16. Use visual cues to detect neglected maintenance.
17. Guide the user through a basic self-inspection checklist.
Tone: Professional, helpful, concise.
Format: Summary followed by bullet points of findings.
`;

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Camera roll access is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
    });
    if (!result.canceled && result.assets.length > 0) {
      setImageLocation(result.assets[0].uri);
      setResponse("");
      if (sound) await sound.stopAsync();
      setIsPlaying(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Camera access is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.6,
    });
    if (!result.canceled && result.assets.length > 0) {
      setImageLocation(result.assets[0].uri);
      setResponse("");
      if (sound) await sound.stopAsync();
      setIsPlaying(false);
    }
  };

  const generateAudio = async (text: string) => {
    if (!text) return;
    setAudioLoading(true);
    try {
      if (sound) await sound.unloadAsync();
      const mp3 = await client.audio.speech.create({
        model: "tts-1",
        voice: selectedVoice,
        input: text,
      });
      const audioData = await mp3.arrayBuffer();
      const b64 = arrayBufferToBase64(audioData);
      const fileUri = FileSystem.cacheDirectory + "car_audio.mp3";
      await FileSystem.writeAsStringAsync(fileUri, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: true }
      );
      setSound(newSound);
      setIsPlaying(true);
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) setIsPlaying(false);
      });
    } catch (err) {
      console.error("Audio Error:", err);
      Alert.alert("Audio Error", "Could not generate voice.");
    } finally {
      setAudioLoading(false);
    }
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  };

  const togglePlayPause = async () => {
    if (!sound) return;
    if (isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  };

  const analyzeImage = async () => {
    if (!imageLocation) {
      setResponse("Please select or take an image first.");
      return;
    }
    setLoading(true);
    setResponse("");
    try {
      const base64Image = await FileSystem.readAsStringAsync(imageLocation, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const userText = carInfo
        ? `Car Info: ${carInfo}\nWhat do you see in this car image?`
        : "What do you see in this car image?";
      const result = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "high" } },
            ] as any
          },
        ],
        max_tokens: 500,
      });
      const aiResponse = result.choices[0].message.content as string;
      const cleanResponse = aiResponse.replace(/\*\*/g, "").replace(/#/g, "🔧🚗");
      setResponse(cleanResponse || "No description received.");

      // Generate audio
      if (cleanResponse) {
        generateAudio(cleanResponse);

        // Mileage prompt if oil mentioned
        if (cleanResponse.toLowerCase().includes("oil")) {
          Alert.alert("Maintenance Tip", "How many miles since your last oil change?");
        }
        // Documentation tip if intermittent issues
        if (
          /intermittent|unknown/i.test(cleanResponse)
        ) {
          Alert.alert(
            "Tip",
            "Note any unusual sounds or when the issue occurs to help your mechanic."
          );
        }
      }
    } catch (error: any) {
      console.error("Image Analysis Error:", error);
      const message = error.response ? JSON.stringify(error.response.data) : error.message;
      setResponse("Failed to analyze image. " + message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Image source={CarGenie} style={{ width: 200, height: 200, marginBottom: 10 }} />
        <Text style={styles.title}>CarDoctor AI</Text>
        <Text style={styles.subtitle}>Vehicle Diagnostic Assistant</Text>

        {/* Make/Model Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Make, Model and Year (optional)"
            value={carInfo}
            onChangeText={setCarInfo}
          />
        </View>

        <VoiceThemeSelector selectedVoice={selectedVoice} onVoiceSelected={setSelectedVoice} />

        <View style={styles.imageButtonsContainer}>
          <TouchableOpacity onPress={takePhoto} style={styles.imageButton}>
            <MaterialIcons name="camera-alt" size={24} color="white" />
            <Text style={styles.imageButtonText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage} style={styles.imageButton}>
            <MaterialIcons name="photo-library" size={24} color="white" />
            <Text style={styles.imageButtonText}>Upload Image</Text>
          </TouchableOpacity>
        </View>

        {imageLocation && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: imageLocation }} style={styles.imagePreview} />
            <TouchableOpacity onPress={analyzeImage} style={styles.analyzeButton} disabled={loading}>
              <MaterialIcons name="search" size={24} color="white" />
              <Text style={styles.analyzeButtonText}>Analyze Image</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF5722" />
            <Text style={styles.loadingText}>Analyzing car image...</Text>
          </View>
        )}

        {audioLoading && (
          <View style={styles.audioLoadingContainer}>
            <ActivityIndicator size="small" color="#FF5722" />
            <Text style={styles.audioLoadingText}>Generating voice...</Text>
          </View>
        )}

        {response && sound && !audioLoading && (
          <View style={styles.audioControlsContainer}>
            <TouchableOpacity onPress={togglePlayPause} style={styles.audioButton}>
              <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={30} color="white" />
              <Text style={styles.audioButtonText}>{isPlaying ? "Pause" : "Play"} Audio</Text>
            </TouchableOpacity>
          </View>
        )}

        {response && !loading && (
          <View style={styles.responseContainer}>
            <Text style={styles.responseTitle}>Diagnostic Summary:</Text>
            <Text style={styles.response}>{response}</Text>
          </View>
        )}

        {/* Self-Inspection Checklist */}
        {response && !loading && (
          <TouchableOpacity
            onPress={() => Alert.alert("Self-Inspection Checklist", checklistText)}
            style={styles.checklistButton}
          >
            <Text style={styles.checklistButtonText}>Show Inspection Checklist</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f5f5" },
  scrollContainer: { 
    flexGrow: 1,
    padding: 20, 
    alignItems: "center" 
  },
  title: { 
    fontSize: 32, 
    fontWeight: "bold", 
    color: "#333", 
    marginBottom: 5 
  },
  subtitle: { 
    fontSize: 15, 
    color: "#666", 
    marginBottom: 20 
  },
  inputContainer: { 
    width: "100%", 
    marginBottom: 15 
  },
  input: {
    width: "100%",
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fff",
  },
  voiceThemeContainer: { 
    width: "100%", 
    marginBottom: 20 
  },
  voiceThemeTitle: { 
    fontSize: 16, 
    fontWeight: "bold", 
    marginBottom: 10 
  },
  voiceThemeScroll: { 
    width: "100%" 
  },
  voiceThemeOption: {
    padding: 15,
    borderRadius: 10,
    marginRight: 10,
    alignItems: "center",
    minWidth: 120,
  },
  selectedVoiceTheme: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    elevation: 5,
  },
  voiceThemeName: { 
    color: "white", 
    fontWeight: "bold", 
    marginTop: 5 
  },
  voiceThemeDescription: { 
    color: "white", 
    fontSize: 10, 
    textAlign: "center" 
  },
  imageButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 20,
  },
  imageButton: {
    backgroundColor: "#FF5722",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: "row",
    width: "45%",
    justifyContent: "center",
  },
  imageButtonText: { 
    color: "#fff", 
    fontWeight: "500", 
    marginLeft: 8 
  },
  imageContainer: { 
    alignItems: "center", 
    marginBottom: 20 
  },
  imagePreview: {
    width: 300,
    height: 300,
    resizeMode: "contain",
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  analyzeButton: {
    backgroundColor: "#FF5722",
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    flexDirection: "row",
    width: "50%",
    justifyContent: "center",
  },
  analyzeButtonText: { 
    color: "#fff", 
    fontWeight: "500", 
    marginLeft: 8 
  },
  loadingContainer: { 
    marginTop: 20, 
    alignItems: "center" 
  },
  loadingText: { 
    marginTop: 10, 
    fontSize: 16, 
    color: "gray" 
  },
  audioLoadingContainer: { 
    marginTop: 10, 
    flexDirection: "row", 
    alignItems: "center" 
  },
  audioLoadingText: { 
    marginLeft: 10, 
    fontSize: 14, 
    color: "gray" 
  },
  audioControlsContainer: { 
    marginTop: 15, 
    marginBottom: 15, 
    alignItems: "center" 
  },
  audioButton: {
    backgroundColor: "#455A64",
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 8,
    flexDirection: "row",
    width: "50%",
    justifyContent: "center",
  },
  audioButtonText: { 
    color: "#fff", 
    fontWeight: "500", 
    marginLeft: 8 
  },
  responseContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 15,
    width: "100%",
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 10,
  },
  responseTitle: { 
    fontSize: 18, 
    fontWeight: "bold", 
    marginBottom: 10, 
    color: "#FF5722" 
  },
  response: { 
    fontSize: 16, 
    lineHeight: 24, 
    color: "#333" 
  },
  checklistButton: {
    backgroundColor: "#455A64",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    width: "100%",
  },
  checklistButtonText: { 
    color: "#fff", 
    textAlign: "center", 
    fontWeight: "500" 
  },
});

export default App;
