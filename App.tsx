import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import OpenAI from "openai";
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import { OPENAI_API_KEY } from "@env";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Modal, FlatList } from 'react-native';




// Import CarGenie image
import CarGenie from './assets/CarGenie.png';


if (!OPENAI_API_KEY) {
  console.error("OpenAI API key is missing.");
}


const client = new OpenAI({ apiKey: OPENAI_API_KEY });


const VoiceThemeSelector = ({ selectedVoice, onVoiceSelected }) => {
  const voiceThemes = {
    alloy: { color: '#4A90E2', icon: 'build', description: 'Technical and balanced tone' },
    echo: { color: '#00796B', icon: 'warning', description: 'Confident and serious tone' },
    fable: { color: '#F9A825', icon: 'local-gas-station', description: 'Friendly, helpful mechanic vibe' },
    onyx: { color: '#37474F', icon: 'car-repair', description: 'Deep, reliable technician voice' },
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
  const [imageLocation, setImageLocation] = useState(null);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [sound, setSound] = useState();
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  type Report = {
    key: string;
    timestamp: string;
    content: string;
  };
 
  const [savedReports, setSavedReports] = useState<Report[]>([]);
 


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


  Tone: Professional, helpful, and concise.
  Format: Summary followed by bullet points of findings.
  `;


  useEffect(() => {
    return sound ? () => sound.unloadAsync() : undefined;
  }, [sound]);


  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera roll access is required.');
      return;
    }


    let result = await ImagePicker.launchImageLibraryAsync({
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
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera access is required.');
      return;
    }


    let result = await ImagePicker.launchCameraAsync({
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


  const generateAudio = async (text) => {
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
      const fileUri = FileSystem.cacheDirectory + "car_audio.mp3";
      await FileSystem.writeAsStringAsync(fileUri, arrayBufferToBase64(audioData), {
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
    } catch (error) {
      console.error("Audio Error:", error);
      Alert.alert("Audio Error", "Could not generate voice.");
    } finally {
      setAudioLoading(false);
    }
  };
  const loadReports = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const reportKeys = keys.filter(key => key.startsWith("car_report_"));
      const items = await AsyncStorage.multiGet(reportKeys);
      const parsed = items.map(([key, value]) => {
        const parsedData = JSON.parse(value);
        return {
          key,
          ...parsedData
        };
      });
      setSavedReports(
  parsed.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
);
      setModalVisible(true);
    } catch (err) {
      console.error("Failed to load reports:", err);
      Alert.alert("Error", "Could not load saved reports.");
    }
  };
 
  const saveReport = async () => {
    try {
      const timestamp = new Date().toISOString();
      const report = {
        timestamp,
        content: response,
      };
      await AsyncStorage.setItem(`car_report_${timestamp}`, JSON.stringify(report));
      Alert.alert("Saved", "Diagnostic report saved successfully.");
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("Error", "Failed to save report.");
    }
  };


  const shareReport = async () => {
    try {
      const path = FileSystem.cacheDirectory + "car_report.txt";
      await FileSystem.writeAsStringAsync(path, response);
      await Sharing.shareAsync(path);
    } catch (error) {
      console.error("Share error:", error);
      Alert.alert("Error", "Failed to share report.");
    }
  };
 
  const deleteReport = async (key: string) => {
    await AsyncStorage.removeItem(key);
    setSavedReports(prev => prev.filter(item => item.key !== key));
  };
 
  const clearAllReports = async () => {
    const keys = await AsyncStorage.getAllKeys();
    const reportKeys = keys.filter((k: string) => k.startsWith("car_report_"));
    await AsyncStorage.multiRemove(reportKeys);
    setSavedReports([]);
  };
 
  const shareReportText = async (text: string) => {
    try {
      const path = FileSystem.cacheDirectory + "shared_report.txt";
      await FileSystem.writeAsStringAsync(path, text);
      await Sharing.shareAsync(path);
    } catch (err) {
      console.error("Share failed:", err);
    }
  };
 
  const arrayBufferToBase64 = (buffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
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


      const userMessageContent = [
        {
          type: "text",
          text: "What do you see in this car image?",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`,
            detail: "high",
          },
        },
      ];


      const result = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessageContent },
        ],
        max_tokens: 500,
      });


      const aiResponse = result?.choices?.[0]?.message?.content;
      const cleanResponse = aiResponse?.replace(/\*\*/g, '').replace(/#/g, '🔧🚗');


      setResponse(cleanResponse || "No description received.");
      if (cleanResponse) generateAudio(cleanResponse);


    } catch (error) {
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
        {/*logo */}
        <Image source={CarGenie} style={{ width: 200, height: 200, marginBottom: 10 }} />


        <Text style={styles.title}>CarDoctor AI</Text>
        <Text style={styles.subtitle}>Vehicle Diagnostic Assistant</Text>


        <VoiceThemeSelector selectedVoice={selectedVoice} onVoiceSelected={setSelectedVoice} />


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


        {imageLocation && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: imageLocation }} style={styles.imagePreview} />
            <TouchableOpacity onPress={analyzeImage} style={styles.analyzeButton} disabled={loading}>
              <MaterialIcons name="search" size={24} color="white" />
              <Text style={styles.analyzeButtonText}>Analyze Image</Text>
            </TouchableOpacity>
          </View>
        )}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{ flex: 1, padding: 20, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 15 }}>Saved Reports</Text>


          <FlatList
            data={savedReports}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (
              <View style={styles.savedReportCard}>
                <Text style={styles.savedReportTime}>{new Date(item.timestamp).toLocaleString()}</Text>
                <Text numberOfLines={3} style={styles.savedReportContent}>{item.content}</Text>


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


          <TouchableOpacity onPress={() => clearAllReports()} style={styles.clearAllButton}>
            <Text style={styles.clearAllText}>Clear All Reports</Text>
          </TouchableOpacity>


          <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>




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
        <TouchableOpacity onPress={loadReports} style={styles.audioButton}>
          <MaterialIcons name="folder" size={24} color="white" />
          <Text style={styles.audioButtonText}>View Saved Reports</Text>
        </TouchableOpacity>


        {response && sound && !audioLoading && (
          <View style={styles.audioControlsContainer}>
            <TouchableOpacity onPress={togglePlayPause} style={styles.audioButton}>
              <MaterialIcons name={isPlaying ? "pause" : "play-arrow"} size={30} color="white" />
              <Text style={styles.audioButtonText}>{isPlaying ? "Pause" : "Play"} Audio</Text>
            </TouchableOpacity>
          </View>
        )}


        {response && !loading && (
          <>
            <View style={styles.responseContainer}>
              <Text style={styles.responseTitle}>Diagnostic Summary:</Text>
              <Text style={styles.response}>{response}</Text>
            </View>


            <View style={styles.nextStepsContainer}>
              <Text style={styles.nextStepsTitle}>What would you like to do next?</Text>


              <TouchableOpacity style={styles.nextButton} onPress={saveReport}>
                <MaterialIcons name="save-alt" size={20} color="#fff" />
                <Text style={styles.nextButtonText}>Save Report</Text>
              </TouchableOpacity>


              <TouchableOpacity style={styles.nextButton} onPress={() => Linking.openURL('https://www.google.com/maps/search/auto+mechanic+near+me')}>
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
          </>
        )}


      </ScrollView>
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  nextStepsContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    borderColor: '#eee',
    borderWidth: 1,
    marginBottom: 30,
  },
  nextStepsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF5722',
    marginBottom: 10,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#607D8B',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 6,
    marginBottom: 10,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 10,
  },  
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  voiceThemeContainer: {
    width: '100%',
    marginBottom: 20,
  },
  voiceThemeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  voiceThemeScroll: {
    width: '100%',
  },
  voiceThemeOption: {
    padding: 15,
    borderRadius: 10,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 120,
  },
  selectedVoiceTheme: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    elevation: 5,
  },
  voiceThemeName: {
    color: 'white',
    fontWeight: 'bold',
    marginTop: 5,
  },
  voiceThemeDescription: {
    color: 'white',
    fontSize: 10,
    textAlign: 'center',
  },
  imageButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  imageButton: {
    backgroundColor: '#FF5722',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    width: '45%',
    justifyContent: 'center',
  },
  savedReportCard: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderColor: '#ddd',
    borderWidth: 1,
  },
  savedReportTime: {
    fontSize: 12,
    color: '#888',
    marginBottom: 5,
  },
  savedReportContent: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
  },
  reportActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reportAction: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  clearAllButton: {
    marginTop: 15,
    backgroundColor: '#FF5252',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  clearAllText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalClose: {
    marginTop: 10,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#FF5722',
    fontWeight: '600',
  },
 
  imageButtonText: {
    color: '#fff',
    fontWeight: '500',
    marginLeft: 8,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  imagePreview: {
    width: 300,
    height: 300,
    resizeMode: 'contain',
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  analyzeButton: {
    backgroundColor: '#607D8B',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '60%',
    paddingRight: 45,   // ⬅️ decrease right padding
  },
  analyzeButtonText: {
    color: '#fff',
    fontWeight: '500',
    alignItems: 'center',       // ✅ aligns icon and text vertically
    marginLeft: 8,
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: 'gray',
  },
  audioLoadingContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  audioLoadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: 'gray',
  },
  audioControlsContainer: {
    marginTop: 15,
    marginBottom: 15,
    alignItems: 'center',
  },
  audioButton: {
    backgroundColor: '#455A64',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    width: '45%',
    alignItems: 'center',       // ✅ aligns icon and text vertically
    justifyContent: 'center',
    paddingRight: 40,   // ⬅️ decrease right padding
  },
  audioButtonText: {
    color: '#fff',
    fontWeight: '500',
    marginLeft: 8,
    fontSize: 16,
    textAlignVertical: 'center',  // ✅ New
    includeFontPadding: false,    // ✅ Optional
  },
 
  responseContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    width: '100%',
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 30,
  },
  responseTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#FF5722',
  },
  response: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
});
export default App;
