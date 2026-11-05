import './styles.css';
import { createState } from './app/state';
import { mountApp } from './app/ui';
import { mountFocusModality } from './lib/dom';

mountFocusModality();
mountApp(createState());
