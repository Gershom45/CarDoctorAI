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
  Switch,
  Modal,
  FlatList,
  Linking,
} from "react-native";
import OpenAI from "openai";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import { MaterialIcons } from "@expo/vector-icons";
import { OPENAI_API_KEY } from "@env";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";

import Footer from "./components/Footer";
import CarGenie from "./assets/CarGenie.png";

if (!OPENAI_API_KEY) {
  console.error("OpenAI API key is missing.");
}
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

type Report = {
  key: string;
  timestamp: string;
  content: string;
};

const VoiceThemeSelector = ({
  selectedVoice,
  onVoiceSelected,
  darkMode,
}: {
  selectedVoice: string;
  onVoiceSelected: (voice: string) => void;
  darkMode: boolean;
}) => {
  const voiceThemes = {
    alloy: {
      color: "#06d6a0",
      icon: "build",
      description: "Technical and balanced tone",
    },
    echo: {
      color: "#26547c",
      icon: "warning",
      description: "Confident and serious tone",
    },
    fable: {
      color: "#ef476f",
      icon: "local-gas-station",
      description: "Friendly, helpful mechanic vibe",
    },
    onyx: {
      color: "#ffd166",
      icon: "car-repair",
      description: "Deep, reliable technician voice",
    },
  };

  return (
    <View style={styles.voiceThemeContainer}>
      <Text
        style={[
          styles.voiceThemeTitle,
          darkMode && { color: "#ccc" },
        ]}
      >
        Select Voice Style
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.voiceThemeScroll}
      >
        {Object.entries(voiceThemes).map(([voice, theme]) => (
          <TouchableOpacity
            key={voice}
            style={[
              styles.voiceThemeOption,
              { backgroundColor: theme.color },
              selectedVoice === voice && styles.selectedVoiceTheme,
            ]}
            onPress={() => onVoiceSelected(voice)}
          >
            <MaterialIcons name={theme.icon} size={24} color="white" />
            <Text style={styles.voiceThemeName}>
              {voice.charAt(0).toUpperCase() + voice.slice(1)}
            </Text>
            <Text style={styles.voiceThemeDescription}>
              {theme.description}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const SettingsScreen = ({
  darkMode,
  setDarkMode,
  metricUnits,
  setMetricUnits,
  highQuality,
  setHighQuality,
  onClose,
}: {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  metricUnits: boolean;
  setMetricUnits: (v: boolean) => void;
  highQuality: boolean;
  setHighQuality: (v: boolean) => void;
  onClose: () => void;
}) => (
  <View
    style={[
      styles.settingsContainer,
      darkMode && { backgroundColor: "#222" },
    ]}
  >
    <View style={styles.settingsHeader}>
      <Text
        style={[
          styles.settingsTitle,
          darkMode && { color: "#fff" },
        ]}
      >
        Settings
      </Text>
      <TouchableOpacity onPress={onClose}>
        <MaterialIcons
          name="close"
          size={28}
          color={darkMode ? "#fff" : "#333"}
        />
      </TouchableOpacity>
    </View>
    <View style={styles.settingsItem}>
      <Text
        style={[
          styles.settingsLabel,
          darkMode && { color: "#ccc" },
        ]}
      >
        Dark Mode
      </Text>
      <Switch value={darkMode} onValueChange={setDarkMode} />
    </View>
    <View style={styles.settingsItem}>
      <Text
        style={[
          styles.settingsLabel,
          darkMode && { color: "#ccc" },
        ]}
      >
        Metric Units (km)
      </Text>
      <Switch value={metricUnits} onValueChange={setMetricUnits} />
    </View>
    <View style={styles.settingsItem}>
      <Text
        style={[
          styles.settingsLabel,
          darkMode && { color: "#ccc" },
        ]}
      >
        High‑Quality Images
      </Text>
      <Switch value={highQuality} onValueChange={setHighQuality} />
    </View>
  </View>
);

const App = () => {
  // core state
  const [carInfo, setCarInfo] = useState("");
  const [imageLocation, setImageLocation] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  // settings
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [metricUnits, setMetricUnits] = useState(false);
  const [highQuality, setHighQuality] = useState(true);

  // reports
  const [modalVisible, setModalVisible] = useState(false);
  const [savedReports, setSavedReports] = useState<Report[]>([]);

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

  // unload audio
  useEffect(() => {
    if (sound) return () => sound.unloadAsync();
  }, [sound]);

  // helpers
  const arrayBufferToBase64 = (buff: ArrayBuffer) => {
    let binary = "";
    const bytes = new Uint8Array(buff);
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  };

  const pickImage = async () => {
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Camera roll access is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: highQuality ? 0.8 : 0.3,
    });
    if (!result.canceled && result.assets.length > 0) {
      setImageLocation(result.assets[0].uri);
      setResponse("");
      if (sound) await sound.stopAsync();
      setIsPlaying(false);
    }
  };

  const takePhoto = async () => {
    const { status } =
      await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Camera access is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: highQuality ? 0.8 : 0.3,
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
      const buff = await mp3.arrayBuffer();
      const b64 = arrayBufferToBase64(buff);
      const uri = FileSystem.cacheDirectory + "car_audio.mp3";
      await FileSystem.writeAsStringAsync(uri, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );
      setSound(newSound);
      setIsPlaying(true);
      newSound.setOnPlaybackStatusUpdate((st) => {
        if (st.didJustFinish) setIsPlaying(false);
      });
    } catch (e) {
      console.error("Audio Error:", e);
      Alert.alert("Audio Error", "Could not generate voice.");
    } finally {
      setAudioLoading(false);
    }
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
      const b64 = await FileSystem.readAsStringAsync(imageLocation, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const unit = metricUnits ? " (km)" : " (mi)";
      const userText = carInfo
        ? `Car Info: ${carInfo}${unit}\nWhat do you see in this car image?`
        : `What do you see in this car image?${unit}`;
      const res = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "high" },
              },
            ] as any,
          },
        ],
        max_tokens: 500,
      });
      const aiResp = res.choices[0].message.content as string;
      const clean = aiResp.replace(/\*\*/g, "").replace(/#/g, "🔧🚗");
      setResponse(clean);
      generateAudio(clean);
      if (clean.toLowerCase().includes("oil")) {
        Alert.alert("Maintenance Tip", "How many miles since your last oil change?");
      }
      if (/intermittent|unknown/i.test(clean)) {
        Alert.alert(
          "Tip",
          "Note any unusual sounds or when the issue occurs to help your mechanic."
        );
      }
    } catch (e: any) {
      console.error("Analysis Error:", e);
      const msg = e.response ? JSON.stringify(e.response.data) : e.message;
      setResponse("Failed to analyze image. " + msg);
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const reps = keys.filter((k) => k.startsWith("car_report_"));
      const items = await AsyncStorage.multiGet(reps);
      const parsed = items.map(([k, v]) => ({ key: k, ...JSON.parse(v!) }));
      setSavedReports(parsed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setModalVisible(true);
    } catch (e) {
      console.error("Load reports failed:", e);
      Alert.alert("Error", "Could not load saved reports.");
    }
  };

  const saveReport = async () => {
    try {
      const ts = new Date().toISOString();
      await AsyncStorage.setItem(`car_report_${ts}`, JSON.stringify({ timestamp: ts, content: response }));
      Alert.alert("Saved", "Report saved successfully.");
    } catch (e) {
      console.error("Save failed:", e);
      Alert.alert("Error", "Failed to save report.");
    }
  };

  const deleteReport = async (key: string) => {
    await AsyncStorage.removeItem(key);
    setSavedReports((p) => p.filter((r) => r.key !== key));
  };

  const clearAllReports = async () => {
    const keys = await AsyncStorage.getAllKeys();
    const reps = keys.filter((k) => k.startsWith("car_report_"));
    await AsyncStorage.multiRemove(reps);
    setSavedReports([]);
  };

  const shareReport = async () => {
    try {
      const p = FileSystem.cacheDirectory + "report.txt";
      await FileSystem.writeAsStringAsync(p, response);
      await Sharing.shareAsync(p);
    } catch (e) {
      console.error("Share failed:", e);
      Alert.alert("Error", "Failed to share report.");
    }
  };

  const shareReportText = async (t: string) => {
    try {
      const p = FileSystem.cacheDirectory + "share.txt";
      await FileSystem.writeAsStringAsync(p, t);
      await Sharing.shareAsync(p);
    } catch { /* noop */ }
  };

  // settings screen
  if (showSettings) {
    return (
      <SafeAreaView style={[styles.safeArea, darkMode && { backgroundColor: "#222" }]}>
        <SettingsScreen
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          metricUnits={metricUnits}
          setMetricUnits={setMetricUnits}
          highQuality={highQuality}
          setHighQuality={setHighQuality}
          onClose={() => setShowSettings(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, darkMode && { backgroundColor: "#222" }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ width: 28 }} />

          <Text style={[styles.title, darkMode && { color: "#fff" }]}>
            CarDoctor AI
          </Text>

          <TouchableOpacity onPress={() => setShowSettings(true)}>
            <MaterialIcons name="settings" size={28} color={darkMode ? "#fff" : "#555"} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.subtitle, darkMode && { color: "#ccc" }]}>
          Vehicle Diagnostic Assistant
        </Text>

        <Image source={CarGenie} style={{ width: 200, height: 200, marginBottom: 10 }} />

        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, darkMode && { backgroundColor: "#333", color: "#fff", borderColor: "#555" }]}
            placeholder="Make, Model and Year (optional)"
            placeholderTextColor={darkMode ? "#999" : "#666"}
            value={carInfo}
            onChangeText={setCarInfo}
          />
        </View>

        <VoiceThemeSelector selectedVoice={selectedVoice} onVoiceSelected={setSelectedVoice} darkMode={darkMode} />

        <View style={styles.imageButtonsContainer}>
          <TouchableOpacity onPress={takePhoto} style={styles.imageButton}>
            <MaterialIcons name="camera-alt" size={24} color="white" />
            <Text style={styles.imageButtonText}>Take Vehicle Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage} style={styles.imageButton}>
            <MaterialIcons name="photo-library" size={24} color="white" />
            <Text style={styles.imageButtonText}>Upload Car Image</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={loadReports} style={styles.viewReportsButton}>
          <MaterialIcons name="folder" size={24} color="white" />
          <Text style={styles.audioButtonText}>View Saved Reports</Text>
        </TouchableOpacity>

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

        <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
          <View style={[styles.modalContainer, darkMode && { backgroundColor: "#222" }]}>
            <Text style={[styles.modalTitle, darkMode && { color: "#fff" }]}>Saved Reports</Text>
            <FlatList
              data={savedReports}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <View style={[styles.savedReportCard, darkMode && { backgroundColor: "#333", borderColor: "#555" }]}>
                  <Text style={[styles.savedReportTime, darkMode && { color: "#aaa" }]}>
                    {new Date(item.timestamp).toLocaleString()}
                  </Text>
                  <Text style={[styles.savedReportContent, darkMode && { color: "#ccc" }]} numberOfLines={3}>
                    {item.content}
                  </Text>
                  <View style={styles.reportActions}>
                    <TouchableOpacity onPress={() => Clipboard.setStringAsync(item.content)}>
                      <Text style={styles.reportAction}>📋 Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => shareReportText(item.content)}>
                      <Text style={styles.reportAction}>📤 Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteReport(item.key)}>
                      <Text style={styles.reportAction}>🗑️ Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
            <TouchableOpacity onPress={clearAllReports} style={styles.clearAllButton}>
              <Text style={styles.clearAllText}>Clear All Reports</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Modal>

        {response && !loading && (
          <View style={[styles.responseContainer, darkMode && { backgroundColor: "#333", borderColor: "#555" }]}>
            <Text style={[styles.responseTitle, darkMode && { color: "#fff" }]}>Diagnostic Summary:</Text>
            <Text style={[styles.response, darkMode && { color: "#ccc" }]}>{response}</Text>
          </View>
        )}

        {response && !loading && (
          <View style={styles.nextStepsContainer}>
            <Text style={styles.nextStepsTitle}>What would you like to do next?</Text>
            <TouchableOpacity style={styles.nextButton} onPress={saveReport}>
              <MaterialIcons name="save-alt" size={20} color="#fff" />
              <Text style={styles.nextButtonText}>Save Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextButton} onPress={() => Linking.openURL("https://www.google.com/maps/search/auto+mechanic+near+me")}>
              <MaterialIcons name="location-on" size={20} color="#fff" />
              <Text style={styles.nextButtonText}>Find Mechanic</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextButton} onPress={shareReport}>
              <MaterialIcons name="share" size={20} color="#fff" />
              <Text style={styles.nextButtonText}>Share Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextButton} onPress={() => {
              setResponse("");
              setImageLocation(null);
              setIsPlaying(false);
            }}>
              <MaterialIcons name="refresh" size={20} color="#fff" />
              <Text style={styles.nextButtonText}>New Diagnosis</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footerContainer}>
          <Footer />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 5,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
  },
  inputContainer: {
    width: "100%",
    marginBottom: 15,
  },
  input: {
    width: "100%",
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fff",
    color: "#333",
  },
  voiceThemeContainer: {
    width: "100%",
    marginBottom: 20,
  },
  voiceThemeTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  voiceThemeScroll: {
    width: "100%",
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
    marginTop: 5,
  },
  voiceThemeDescription: {
    color: "white",
    fontSize: 10,
    textAlign: "center",
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
    marginLeft: 8,
  },
  viewReportsButton: {
    backgroundColor: "#455A64",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: "row",
    width: "60%",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "gray",
  },
  audioLoadingContainer: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  audioLoadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: "gray",
  },
  audioControlsContainer: {
    marginTop: 15,
    marginBottom: 15,
    alignItems: "center",
  },
  audioButton: {
    backgroundColor: "#455A64",
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 8,
    flexDirection: "row",
    width: "50%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  audioButtonText: {
    color: "#fff",
    fontWeight: "500",
    marginLeft: 8,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: 20,
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
    backgroundColor: "#607D8B",
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "60%",
  },
  analyzeButtonText: {
    color: "#fff",
    fontWeight: "500",
    marginLeft: 8,
  },
  responseContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 15,
    width: "100%",
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 30,
  },
  responseTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#FF5722",
  },
  response: {
    fontSize: 16,
    lineHeight: 24,
    color: "#333",
  },
  nextStepsContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    width: "100%",
    borderColor: "#eee",
    borderWidth: 1,
    marginBottom: 30,
  },
  nextStepsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FF5722",
    marginBottom: 10,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#607D8B",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 6,
    marginBottom: 10,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
    marginLeft: 10,
  },
  footerContainer: {
    backgroundColor: "#f5f5f5",
    padding: 10,
    justifyContent: "flex-end",
  },
  settingsContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  settingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  settingsItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  settingsLabel: {
    fontSize: 16,
    color: "#333",
  },
  savedReportCard: {
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderColor: "#ddd",
    borderWidth: 1,
  },
  savedReportTime: {
    fontSize: 12,
    color: "#888",
    marginBottom: 5,
  },
  savedReportContent: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
  },
  reportActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  reportAction: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "500",
  },
  clearAllButton: {
    marginTop: 15,
    backgroundColor: "#FF5252",
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  clearAllText: {
    color: "#fff",
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 15,
  },
  modalClose: {
    marginTop: 10,
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 16,
    color: "#FF5722",
    fontWeight: "600",
  },
});

export default App;
