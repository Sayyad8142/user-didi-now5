import React, { useEffect } from 'react';
import { HomeScreen } from '@/features/home/HomeScreen';
import { mark } from '@/lib/perfMarks';

const Home = () => {
  useEffect(() => { mark('home.mounted'); }, []);
  return <HomeScreen />;
};

export default Home;
