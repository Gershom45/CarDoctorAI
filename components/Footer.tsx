import { StyleSheet, Text, View } from 'react-native';
interface Props { children?: React.ReactNode; }

export default function Footer(props: Props) {
    return (    
        <View style={styles.footerContainer}>
           <Text style={styles.footerText}>&copy; Nickolas Huang, Sierra Stump, Arely Marquez, Trey Gaul, Manuel, James Harden</Text>
        </View>  
    );
}

const styles = StyleSheet.create({  
    footerContainer: {
        backgroundColor: '#f0f0f0',
        padding: 10,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
    },
});